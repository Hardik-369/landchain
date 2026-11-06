// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LandchainAccess} from "./LandchainAccess.sol";

/**
 * @title InvestmentPool
 * @notice Funding pool and investment validation for LANDCHAIN properties.
 *
 * A pool is opened by the operator with the funding target, the minimum
 * investment, the unit price and the total number of units. Every investment is
 * validated on-chain before it is recorded:
 *
 *  - the property pool must exist and be open;
 *  - units must be positive and available;
 *  - the amount must equal units * unitPrice;
 *  - the amount must meet the pool minimum;
 *  - the pool must not exceed its funding target.
 *
 * The contract records funding state only. Moving money is handled by the
 * payment rail; the backend passes the settled amount and its reference, and the
 * contract rejects anything that does not match the published terms.
 */
contract InvestmentPool is LandchainAccess {
    struct Pool {
        uint256 targetAmount;
        uint256 minInvestment;
        uint256 unitPrice;
        uint256 amountRaised;
        uint32 totalUnits;
        uint32 unitsSold;
        uint64 openedAt;
        uint64 closedAt;
        bool open;
        bool exists;
    }

    struct InvestmentRecord {
        address investor;
        uint32 units;
        uint256 amount;
        bytes32 paymentRef;
        uint64 recordedAt;
    }

    /// @notice propertyId => pool terms and funding progress
    mapping(string => Pool) private _pools;
    /// @notice propertyId => investor => settled amount
    mapping(string => mapping(address => uint256)) private _contributions;
    /// @notice propertyId => investor => units
    mapping(string => mapping(address => uint32)) private _units;
    /// @notice propertyId => append-only investment records
    mapping(string => InvestmentRecord[]) private _investments;
    string[] private _propertyIds;

    event PoolOpened(
        string propertyId,
        uint256 targetAmount,
        uint256 minInvestment,
        uint256 unitPrice,
        uint32 totalUnits
    );
    event PoolClosed(string propertyId, uint32 unitsSold, uint256 amountRaised);
    event PoolReopened(string propertyId);
    event InvestmentRecorded(
        string propertyId,
        uint256 indexed investmentIndex,
        address indexed investor,
        uint32 units,
        uint256 amount,
        bytes32 paymentRef,
        uint32 unitsSold,
        uint256 amountRaised
    );

    error EmptyPropertyId();
    error PoolAlreadyExists(string propertyId);
    error PoolNotOpen(string propertyId);
    error InvalidTerms();
    error NoUnits();
    error AmountMismatch(uint256 expected, uint256 received);
    error BelowMinimum(uint256 minimum, uint256 amount);
    error ExceedsUnits(uint32 remaining, uint32 requested);
    error ExceedsTarget(uint256 remaining, uint256 amount);

    /// @notice Open the investment pool for `propertyId`.
    function openPool(
        string calldata propertyId,
        uint256 targetAmount,
        uint256 minInvestment,
        uint256 unitPrice,
        uint32 totalUnits
    ) external onlyOperator returns (bool) {
        if (bytes(propertyId).length == 0) revert EmptyPropertyId();
        if (_pools[propertyId].exists) revert PoolAlreadyExists(propertyId);
        if (
            targetAmount == 0 ||
            minInvestment == 0 ||
            unitPrice == 0 ||
            totalUnits == 0 ||
            minInvestment > targetAmount
        ) revert InvalidTerms();

        _pools[propertyId] = Pool({
            targetAmount: targetAmount,
            minInvestment: minInvestment,
            unitPrice: unitPrice,
            amountRaised: 0,
            totalUnits: totalUnits,
            unitsSold: 0,
            openedAt: uint64(block.timestamp),
            closedAt: 0,
            open: true,
            exists: true
        });
        _propertyIds.push(propertyId);

        emit PoolOpened(propertyId, targetAmount, minInvestment, unitPrice, totalUnits);
        return true;
    }

    /**
     * @notice Validate and record a settled investment.
     * @param paymentRef backend payment / transfer reference. Stored so the
     *        on-chain record can always be reconciled with the payment rail.
     */
    function recordInvestment(
        string calldata propertyId,
        address investor,
        uint32 units,
        uint256 amount,
        bytes32 paymentRef
    ) external onlyOperator returns (uint256 investmentIndex) {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists || !pool.open) revert PoolNotOpen(propertyId);
        if (investor == address(0)) revert ZeroAddress();
        if (units == 0) revert NoUnits();

        uint32 remainingUnits = pool.totalUnits - pool.unitsSold;
        if (units > remainingUnits) revert ExceedsUnits(remainingUnits, units);

        uint256 expected = uint256(units) * pool.unitPrice;
        if (amount != expected) revert AmountMismatch(expected, amount);
        if (amount < pool.minInvestment) revert BelowMinimum(pool.minInvestment, amount);

        uint256 remainingTarget = pool.targetAmount - pool.amountRaised;
        if (amount > remainingTarget) revert ExceedsTarget(remainingTarget, amount);

        pool.unitsSold += units;
        pool.amountRaised += amount;
        _contributions[propertyId][investor] += amount;
        _units[propertyId][investor] += units;

        investmentIndex = _investments[propertyId].length;
        _investments[propertyId].push(
            InvestmentRecord({
                investor: investor,
                units: units,
                amount: amount,
                paymentRef: paymentRef,
                recordedAt: uint64(block.timestamp)
            })
        );

        emit InvestmentRecorded(
            propertyId,
            investmentIndex,
            investor,
            units,
            amount,
            paymentRef,
            pool.unitsSold,
            pool.amountRaised
        );
    }

    /// @notice Stop accepting investments (funded or withdrawn from sale).
    function closePool(string calldata propertyId) external onlyAdmin returns (bool) {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists) revert PoolNotOpen(propertyId);
        pool.open = false;
        pool.closedAt = uint64(block.timestamp);
        emit PoolClosed(propertyId, pool.unitsSold, pool.amountRaised);
        return true;
    }

    function reopenPool(string calldata propertyId) external onlyAdmin returns (bool) {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists) revert PoolNotOpen(propertyId);
        pool.open = true;
        pool.closedAt = 0;
        emit PoolReopened(propertyId);
        return true;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getPool(string calldata propertyId)
        external
        view
        returns (
            uint256 targetAmount,
            uint256 minInvestment,
            uint256 unitPrice,
            uint256 amountRaised,
            uint32 totalUnits,
            uint32 unitsSold,
            bool open
        )
    {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists) revert PoolNotOpen(propertyId);
        return (
            pool.targetAmount,
            pool.minInvestment,
            pool.unitPrice,
            pool.amountRaised,
            pool.totalUnits,
            pool.unitsSold,
            pool.open
        );
    }

    function hasPool(string calldata propertyId) external view returns (bool) {
        return _pools[propertyId].exists;
    }

    /// @notice Funding progress in basis points (10000 = fully funded).
    function fundingProgressBps(string calldata propertyId) external view returns (uint256) {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists || pool.targetAmount == 0) return 0;
        uint256 progress = (pool.amountRaised * 10_000) / pool.targetAmount;
        return progress > 10_000 ? 10_000 : progress;
    }

    function isFunded(string calldata propertyId) external view returns (bool) {
        Pool storage pool = _pools[propertyId];
        return pool.exists && pool.targetAmount > 0 && pool.amountRaised >= pool.targetAmount;
    }

    function unitsRemaining(string calldata propertyId) external view returns (uint32) {
        Pool storage pool = _pools[propertyId];
        if (!pool.exists) return 0;
        return pool.totalUnits - pool.unitsSold;
    }

    function contributionOf(string calldata propertyId, address investor)
        external
        view
        returns (uint256 amount, uint32 units)
    {
        return (_contributions[propertyId][investor], _units[propertyId][investor]);
    }

    function investmentCount(string calldata propertyId) external view returns (uint256) {
        return _investments[propertyId].length;
    }

    function getInvestment(string calldata propertyId, uint256 index)
        external
        view
        returns (
            address investor,
            uint32 units,
            uint256 amount,
            bytes32 paymentRef,
            uint64 recordedAt
        )
    {
        InvestmentRecord storage record = _investments[propertyId][index];
        return (record.investor, record.units, record.amount, record.paymentRef, record.recordedAt);
    }

    function getPropertyIds() external view returns (string[] memory) {
        return _propertyIds;
    }
}
