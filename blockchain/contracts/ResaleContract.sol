// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LandchainAccess} from "./LandchainAccess.sol";
import {ITokenAllocation} from "./interfaces/ITokenAllocation.sol";

/**
 * @title ResaleContract
 * @notice Secondary-market unit resale for LANDCHAIN.
 *
 * Units are escrowed when a listing is created: the seller's units move into
 * this contract, so a seller can never list the same units twice or spend them
 * while a buyer is paying. The lifecycle is:
 *
 *   createListing -> [reserveUnits] -> completeResale
 *                 -> cancelListing (returns escrowed units)
 *
 * Only the operator settles a resale, and only after the buyer reserved it (or
 * the reservation expired). Payment happens off-chain through the backend; the
 * contract records the settled trade and moves the escrowed units atomically.
 */
contract ResaleContract is LandchainAccess {
    enum ListingStatus {
        None,
        Active,
        Reserved,
        Completed,
        Cancelled
    }

    struct Listing {
        string propertyId;
        address seller;
        uint32 units;
        uint256 pricePerUnit;
        address reservedBy;
        uint64 reservedAt;
        uint64 createdAt;
        uint64 completedAt;
        ListingStatus status;
    }

    ITokenAllocation public immutable tokenAllocation;

    /// @notice How long a buyer's reservation holds a listing (seconds).
    uint32 public reservationPeriod = 15 minutes;
    uint32 public constant MIN_RESERVATION_PERIOD = 1 minutes;
    uint32 public constant MAX_RESERVATION_PERIOD = 7 days;

    uint256 public listingCount;
    mapping(uint256 => Listing) private _listings;

    event ListingCreated(
        uint256 indexed listingId,
        string propertyId,
        address indexed seller,
        uint32 units,
        uint256 pricePerUnit
    );
    event UnitsReserved(
        uint256 indexed listingId,
        address indexed buyer,
        uint64 reservedAt,
        uint64 expiresAt
    );
    event ReservationCancelled(uint256 indexed listingId, address indexed buyer);
    event ListingCancelled(uint256 indexed listingId, address indexed seller, uint32 unitsReturned);
    event ResaleCompleted(
        uint256 indexed listingId,
        string propertyId,
        address indexed seller,
        address indexed buyer,
        uint32 units,
        uint256 pricePerUnit,
        uint256 totalAmount,
        bytes32 paymentRef
    );
    event ReservationPeriodUpdated(uint32 secondsValue);

    error NoUnits();
    error InvalidPrice();
    error InvalidListing(uint256 listingId);
    error ListingNotActive(uint256 listingId);
    error ListingNotReserved(uint256 listingId);
    error NotSeller();
    error NotReserver();
    error SellerCannotReserve();
    error ReservationExpired(uint256 listingId);
    error ReservationActive(uint256 listingId);
    error InsufficientUnits(uint32 balance, uint32 requested);
    error InvalidPeriod();

    constructor(address tokenAllocationAddress) {
        if (tokenAllocationAddress == address(0)) revert ZeroAddress();
        tokenAllocation = ITokenAllocation(tokenAllocationAddress);
    }

    /// @notice Escrow `units` and list them for resale.
    function createListing(
        string calldata propertyId,
        uint32 units,
        uint256 pricePerUnit
    ) external returns (uint256 listingId) {
        if (units == 0) revert NoUnits();
        if (pricePerUnit == 0) revert InvalidPrice();

        uint32 balance = tokenAllocation.balanceOf(propertyId, msg.sender);
        if (balance < units) revert InsufficientUnits(balance, units);

        listingId = listingCount;
        _listings[listingId] = Listing({
            propertyId: propertyId,
            seller: msg.sender,
            units: units,
            pricePerUnit: pricePerUnit,
            reservedBy: address(0),
            reservedAt: 0,
            createdAt: uint64(block.timestamp),
            completedAt: 0,
            status: ListingStatus.Active
        });
        listingCount += 1;

        // Pull the units into escrow. This contract must be authorised on the
        // TokenAllocation ledger; deploy.js wires that up.
        tokenAllocation.transferUnits(propertyId, msg.sender, address(this), units);

        emit ListingCreated(listingId, propertyId, msg.sender, units, pricePerUnit);
    }

    /// @notice Reserve an active listing for `reservationPeriod` seconds.
    function reserveUnits(uint256 listingId) external returns (bool) {
        Listing storage listing = _listings[listingId];
        if (listing.status == ListingStatus.None || listing.status == ListingStatus.Completed) {
            revert InvalidListing(listingId);
        }
        if (listing.status == ListingStatus.Cancelled) revert ListingNotActive(listingId);
        if (msg.sender == listing.seller) revert SellerCannotReserve();
        if (listing.status == ListingStatus.Reserved && !_reservationExpired(listing)) {
            revert ReservationActive(listingId);
        }

        listing.reservedBy = msg.sender;
        listing.reservedAt = uint64(block.timestamp);
        listing.status = ListingStatus.Reserved;

        uint64 expiresAt = uint64(block.timestamp) + reservationPeriod;
        emit UnitsReserved(listingId, msg.sender, uint64(block.timestamp), expiresAt);
        return true;
    }

    /// @notice Release a reservation without cancelling the listing.
    function cancelReservation(uint256 listingId) external returns (bool) {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Reserved) revert ListingNotReserved(listingId);
        if (msg.sender != listing.reservedBy && msg.sender != admin) revert NotReserver();

        address buyer = listing.reservedBy;
        listing.reservedBy = address(0);
        listing.reservedAt = 0;
        listing.status = ListingStatus.Active;

        emit ReservationCancelled(listingId, buyer);
        return true;
    }

    /**
     * @notice Settle a reserved resale and release escrowed units to the buyer.
     * @param paymentRef payment / transfer reference from the backend.
     */
    function completeResale(uint256 listingId, bytes32 paymentRef)
        external
        onlyOperator
        returns (bool)
    {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Reserved) revert ListingNotReserved(listingId);
        if (_reservationExpired(listing)) revert ReservationExpired(listingId);

        address buyer = listing.reservedBy;
        if (buyer == address(0)) revert ZeroAddress();

        uint32 units = listing.units;
        uint256 totalAmount = uint256(units) * listing.pricePerUnit;

        listing.status = ListingStatus.Completed;
        listing.completedAt = uint64(block.timestamp);
        listing.units = 0;

        tokenAllocation.transferUnits(listing.propertyId, address(this), buyer, units);

        emit ResaleCompleted(
            listingId,
            listing.propertyId,
            listing.seller,
            buyer,
            units,
            listing.pricePerUnit,
            totalAmount,
            paymentRef
        );
        return true;
    }

    /// @notice Cancel a listing and return escrowed units to the seller.
    function cancelListing(uint256 listingId) external returns (bool) {
        Listing storage listing = _listings[listingId];
        if (listing.status == ListingStatus.None || listing.status == ListingStatus.Completed) {
            revert InvalidListing(listingId);
        }
        if (listing.status == ListingStatus.Cancelled) revert ListingNotActive(listingId);
        if (msg.sender != listing.seller && msg.sender != admin) revert NotSeller();
        if (
            listing.status == ListingStatus.Reserved &&
            !_reservationExpired(listing) &&
            msg.sender != admin
        ) revert ReservationActive(listingId);

        uint32 units = listing.units;
        listing.status = ListingStatus.Cancelled;
        listing.units = 0;

        tokenAllocation.transferUnits(listing.propertyId, address(this), listing.seller, units);

        emit ListingCancelled(listingId, listing.seller, units);
        return true;
    }

    /// @notice Change how long a reservation holds a listing.
    function setReservationPeriod(uint32 secondsValue) external onlyAdmin {
        if (secondsValue < MIN_RESERVATION_PERIOD || secondsValue > MAX_RESERVATION_PERIOD) {
            revert InvalidPeriod();
        }
        reservationPeriod = secondsValue;
        emit ReservationPeriodUpdated(secondsValue);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getListing(uint256 listingId)
        external
        view
        returns (
            string memory propertyId,
            address seller,
            uint32 units,
            uint256 pricePerUnit,
            address reservedBy,
            uint64 reservedAt,
            ListingStatus status
        )
    {
        Listing storage listing = _listings[listingId];
        if (listing.status == ListingStatus.None) revert InvalidListing(listingId);
        return (
            listing.propertyId,
            listing.seller,
            listing.units,
            listing.pricePerUnit,
            listing.reservedBy,
            listing.reservedAt,
            listing.status
        );
    }

    function reservationExpiresAt(uint256 listingId) external view returns (uint64) {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Reserved) return 0;
        return listing.reservedAt + reservationPeriod;
    }

    function isReservationActive(uint256 listingId) external view returns (bool) {
        Listing storage listing = _listings[listingId];
        return listing.status == ListingStatus.Reserved && !_reservationExpired(listing);
    }

    function _reservationExpired(Listing storage listing) private view returns (bool) {
        if (listing.reservedAt == 0) return false;
        return block.timestamp >= uint256(listing.reservedAt) + reservationPeriod;
    }
}
