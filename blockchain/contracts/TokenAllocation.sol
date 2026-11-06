// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LandchainAccess} from "./LandchainAccess.sol";

/**
 * @title TokenAllocation
 * @notice On-chain unit ledger for LANDCHAIN property tokens.
 *
 * Each property has a fixed supply of units. The operator allocates units to
 * investors after a settled investment; units can only move through the operator
 * or through an explicitly authorised contract (the ResaleContract escrow).
 * There is no open `transfer` function, so an investor cannot move somebody
 * else's units and an unauthorised contract cannot mint or move units at all.
 *
 * Hedera Token Service is the settlement rail: one HTS fungible token is created
 * per property and this ledger mirrors the balances with property-scoped
 * ownership maths. `unit` values here and HTS token amounts are kept identical
 * (decimals = 0).
 */
contract TokenAllocation is LandchainAccess {
    struct Supply {
        uint32 totalUnits;
        uint32 allocatedUnits;
        bool exists;
    }

    mapping(string => Supply) private _supply;
    mapping(string => mapping(address => uint32)) private _balances;
    mapping(address => bool) public isAuthorizedContract;
    string[] private _propertyIds;

    event PropertySupplySet(string propertyId, uint32 totalUnits);
    event ContractAuthorized(address indexed account, bool allowed);
    event UnitsAllocated(
        string propertyId,
        address indexed investor,
        uint32 units,
        uint32 balance,
        uint32 allocatedUnits
    );
    event UnitsTransferred(
        string propertyId,
        address indexed from,
        address indexed to,
        uint32 units,
        uint32 fromBalance,
        uint32 toBalance
    );

    error EmptyPropertyId();
    error SupplyAlreadySet(string propertyId);
    error SupplyNotSet(string propertyId);
    error InvalidSupply();
    error NoUnits();
    error SelfTransfer();
    error ExceedsSupply(uint32 remaining, uint32 requested);
    error InsufficientUnits(uint32 balance, uint32 requested);
    error NotAuthorized();

    modifier onlyAllocator() {
        if (msg.sender != admin && !isOperator[msg.sender] && !isAuthorizedContract[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    /// @notice Fix the unit supply of a property. Can only be set once.
    function setPropertySupply(string calldata propertyId, uint32 totalUnits)
        external
        onlyOperator
        returns (bool)
    {
        if (bytes(propertyId).length == 0) revert EmptyPropertyId();
        if (_supply[propertyId].exists) revert SupplyAlreadySet(propertyId);
        if (totalUnits == 0) revert InvalidSupply();

        _supply[propertyId] = Supply({
            totalUnits: totalUnits,
            allocatedUnits: 0,
            exists: true
        });
        _propertyIds.push(propertyId);

        emit PropertySupplySet(propertyId, totalUnits);
        return true;
    }

    /**
     * @notice Authorise a contract (the ResaleContract) to move escrowed units.
     * Only the admin can grant this, and revoking it immediately freezes any
     * contract that was compromised.
     */
    function setAuthorizedContract(address account, bool allowed) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isAuthorizedContract[account] = allowed;
        emit ContractAuthorized(account, allowed);
    }

    /// @notice Allocate newly issued units to an investor.
    function allocate(
        string calldata propertyId,
        address investor,
        uint32 units
    ) external onlyAllocator returns (uint32 balance) {
        Supply storage supply = _supply[propertyId];
        if (!supply.exists) revert SupplyNotSet(propertyId);
        if (investor == address(0)) revert ZeroAddress();
        if (units == 0) revert NoUnits();

        uint32 remaining = supply.totalUnits - supply.allocatedUnits;
        if (units > remaining) revert ExceedsSupply(remaining, units);

        supply.allocatedUnits += units;
        _balances[propertyId][investor] += units;
        balance = _balances[propertyId][investor];

        emit UnitsAllocated(propertyId, investor, units, balance, supply.allocatedUnits);
    }

    /// @notice Move existing units between accounts (resale settlement, treasury).
    function transferUnits(
        string calldata propertyId,
        address from,
        address to,
        uint32 units
    ) external onlyAllocator returns (bool) {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (from == to) revert SelfTransfer();
        if (units == 0) revert NoUnits();

        uint32 balance = _balances[propertyId][from];
        if (balance < units) revert InsufficientUnits(balance, units);

        _balances[propertyId][from] = balance - units;
        _balances[propertyId][to] += units;

        emit UnitsTransferred(
            propertyId,
            from,
            to,
            units,
            _balances[propertyId][from],
            _balances[propertyId][to]
        );
        return true;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function balanceOf(string calldata propertyId, address investor)
        external
        view
        returns (uint32)
    {
        return _balances[propertyId][investor];
    }

    function getSupply(string calldata propertyId)
        external
        view
        returns (uint32 totalUnits, uint32 allocatedUnits, uint32 unallocatedUnits)
    {
        Supply storage supply = _supply[propertyId];
        return (
            supply.totalUnits,
            supply.allocatedUnits,
            supply.totalUnits - supply.allocatedUnits
        );
    }

    function hasSupply(string calldata propertyId) external view returns (bool) {
        return _supply[propertyId].exists;
    }

    /// @notice Ownership in basis points of the property's total supply.
    function ownershipBps(string calldata propertyId, address investor)
        external
        view
        returns (uint256)
    {
        Supply storage supply = _supply[propertyId];
        if (!supply.exists || supply.totalUnits == 0) return 0;
        return (uint256(_balances[propertyId][investor]) * 10_000) / supply.totalUnits;
    }

    function getPropertyIds() external view returns (string[] memory) {
        return _propertyIds;
    }
}
