// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LandchainAccess} from "./LandchainAccess.sol";

/**
 * @title PropertyRegistry
 * @notice On-chain property hash registry for LANDCHAIN.
 *
 * One record per property ID. The registry is append-only for history: the
 * latest hash is stored on the record, while every previous property hash and
 * every anchored document hash is kept in per-property arrays. A hash can never
 * be deleted, only superseded.
 *
 * Hashes are SHA-256 digests produced by the backend hash registry service and
 * passed in as bytes32. The contract does not hash documents itself: it anchors
 * a digest that can be recomputed from the original file (see README).
 */
contract PropertyRegistry is LandchainAccess {
    struct PropertyRecord {
        bytes32 propertyHash;
        uint64 registeredAt;
        uint64 updatedAt;
        uint32 documentCount;
        uint32 version;
        bool exists;
    }

    struct DocumentRecord {
        bytes32 documentHash;
        string documentType;
        uint64 anchoredAt;
        address anchoredBy;
    }

    /// @notice propertyId => registry record
    mapping(string => PropertyRecord) private _properties;
    /// @notice propertyId => full property hash history (oldest first)
    mapping(string => bytes32[]) private _propertyHashHistory;
    /// @notice propertyId => anchored document hashes
    mapping(string => DocumentRecord[]) private _documents;
    /// @notice every registered property ID, for enumeration
    string[] private _propertyIds;

    event PropertyRegistered(
        string propertyId,
        bytes32 indexed propertyHash,
        address indexed registeredBy,
        uint64 registeredAt
    );
    event PropertyHashUpdated(
        string propertyId,
        bytes32 indexed previousHash,
        bytes32 indexed newHash,
        uint32 version,
        address indexed updatedBy,
        uint64 updatedAt
    );
    event DocumentHashStored(
        string propertyId,
        bytes32 indexed documentHash,
        string documentType,
        address indexed anchoredBy,
        uint64 anchoredAt
    );

    error EmptyPropertyId();
    error EmptyHash();
    error PropertyAlreadyRegistered(string propertyId);
    error PropertyNotRegistered(string propertyId);

    /// @notice Register a new property and anchor its first property hash.
    function registerProperty(string calldata propertyId, bytes32 propertyHash)
        external
        onlyVerifier
        returns (bool)
    {
        if (bytes(propertyId).length == 0) revert EmptyPropertyId();
        if (propertyHash == bytes32(0)) revert EmptyHash();
        if (_properties[propertyId].exists) revert PropertyAlreadyRegistered(propertyId);

        uint64 timestamp = uint64(block.timestamp);
        _properties[propertyId] = PropertyRecord({
            propertyHash: propertyHash,
            registeredAt: timestamp,
            updatedAt: timestamp,
            documentCount: 0,
            version: 1,
            exists: true
        });
        _propertyHashHistory[propertyId].push(propertyHash);
        _propertyIds.push(propertyId);

        emit PropertyRegistered(propertyId, propertyHash, msg.sender, timestamp);
        return true;
    }

    /// @notice Anchor a new property hash version (e.g. after a metadata edit).
    function updatePropertyHash(string calldata propertyId, bytes32 newHash)
        external
        onlyVerifier
        returns (uint32 version)
    {
        if (newHash == bytes32(0)) revert EmptyHash();
        PropertyRecord storage record = _properties[propertyId];
        if (!record.exists) revert PropertyNotRegistered(propertyId);

        bytes32 previous = record.propertyHash;
        record.propertyHash = newHash;
        record.version += 1;
        record.updatedAt = uint64(block.timestamp);
        version = record.version;
        _propertyHashHistory[propertyId].push(newHash);

        emit PropertyHashUpdated(
            propertyId,
            previous,
            newHash,
            version,
            msg.sender,
            record.updatedAt
        );
    }

    /// @notice Anchor one document digest for an existing property.
    function storeDocumentHash(
        string calldata propertyId,
        bytes32 documentHash,
        string calldata documentType
    ) external onlyVerifier returns (uint32 documentIndex) {
        if (documentHash == bytes32(0)) revert EmptyHash();
        PropertyRecord storage record = _properties[propertyId];
        if (!record.exists) revert PropertyNotRegistered(propertyId);

        uint64 timestamp = uint64(block.timestamp);
        _documents[propertyId].push(
            DocumentRecord({
                documentHash: documentHash,
                documentType: documentType,
                anchoredAt: timestamp,
                anchoredBy: msg.sender
            })
        );
        record.documentCount += 1;
        record.updatedAt = timestamp;
        documentIndex = record.documentCount - 1;

        emit DocumentHashStored(
            propertyId,
            documentHash,
            documentType,
            msg.sender,
            timestamp
        );
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function hasProperty(string calldata propertyId) external view returns (bool) {
        return _properties[propertyId].exists;
    }

    function getProperty(string calldata propertyId)
        external
        view
        returns (
            bytes32 propertyHash,
            uint64 registeredAt,
            uint64 updatedAt,
            uint32 documentCount,
            uint32 version
        )
    {
        PropertyRecord storage record = _properties[propertyId];
        if (!record.exists) revert PropertyNotRegistered(propertyId);
        return (
            record.propertyHash,
            record.registeredAt,
            record.updatedAt,
            record.documentCount,
            record.version
        );
    }

    /// @notice True when `candidate` is the current hash for the property.
    function verifyPropertyHash(string calldata propertyId, bytes32 candidate)
        external
        view
        returns (bool)
    {
        PropertyRecord storage record = _properties[propertyId];
        return record.exists && record.propertyHash == candidate;
    }

    function getPropertyHashHistory(string calldata propertyId)
        external
        view
        returns (bytes32[] memory)
    {
        return _propertyHashHistory[propertyId];
    }

    function getDocumentCount(string calldata propertyId) external view returns (uint32) {
        return _properties[propertyId].documentCount;
    }

    function getDocument(string calldata propertyId, uint32 index)
        external
        view
        returns (
            bytes32 documentHash,
            string memory documentType,
            uint64 anchoredAt,
            address anchoredBy
        )
    {
        DocumentRecord storage document = _documents[propertyId][index];
        return (
            document.documentHash,
            document.documentType,
            document.anchoredAt,
            document.anchoredBy
        );
    }

    function getDocumentHashes(string calldata propertyId)
        external
        view
        returns (bytes32[] memory hashes)
    {
        DocumentRecord[] storage documents = _documents[propertyId];
        hashes = new bytes32[](documents.length);
        for (uint256 i = 0; i < documents.length; i += 1) {
            hashes[i] = documents[i].documentHash;
        }
    }

    function getPropertyIds() external view returns (string[] memory) {
        return _propertyIds;
    }

    function propertyCount() external view returns (uint256) {
        return _propertyIds.length;
    }
}
