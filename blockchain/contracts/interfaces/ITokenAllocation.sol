// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The subset of TokenAllocation the resale escrow depends on.
interface ITokenAllocation {
    function balanceOf(string calldata propertyId, address investor)
        external
        view
        returns (uint32);

    function transferUnits(
        string calldata propertyId,
        address from,
        address to,
        uint32 units
    ) external returns (bool);
}
