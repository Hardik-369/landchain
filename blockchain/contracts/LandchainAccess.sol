// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title LandchainAccess
 * @notice Shared, deliberately small role system for the LANDCHAIN contracts.
 *
 * Three roles exist:
 *  - admin    : deployment owner, may grant/revoke roles and wire contracts.
 *  - verifier : may write to the property registry (hash anchoring).
 *  - operator : may record investments, allocate units and settle resales.
 *
 * The backend signer is the operator; the verification service is the verifier.
 * No contract in this repo lets an arbitrary caller mutate registry or ledger
 * state, which is what prevents unauthorised token transfers.
 */
abstract contract LandchainAccess {
    address public admin;
    mapping(address => bool) public isVerifier;
    mapping(address => bool) public isOperator;

    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event VerifierUpdated(address indexed account, bool allowed);
    event OperatorUpdated(address indexed account, bool allowed);

    error NotAdmin();
    error NotVerifier();
    error NotOperator();
    error ZeroAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyVerifier() {
        if (msg.sender != admin && !isVerifier[msg.sender]) revert NotVerifier();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != admin && !isOperator[msg.sender]) revert NotOperator();
        _;
    }

    constructor() {
        admin = msg.sender;
        emit AdminChanged(address(0), msg.sender);
    }

    function setVerifier(address account, bool allowed) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isVerifier[account] = allowed;
        emit VerifierUpdated(account, allowed);
    }

    function setOperator(address account, bool allowed) external onlyAdmin {
        if (account == address(0)) revert ZeroAddress();
        isOperator[account] = allowed;
        emit OperatorUpdated(account, allowed);
    }

    /**
     * @notice Two-step admin handover. The new admin must accept, so a typo can
     * never lock the contracts permanently.
     */
    address public pendingAdmin;

    event AdminTransferStarted(address indexed pendingAdmin);

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAdmin();
        emit AdminChanged(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }
}
