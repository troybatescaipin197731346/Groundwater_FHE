// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GlobalGroundwaterFHE is SepoliaConfig {
    struct EncryptedWaterData {
        uint256 id;
        euint32 encryptedLevel;
        euint32 encryptedRegion;
        euint32 encryptedTimestamp;
        uint256 submittedAt;
    }

    struct DecryptedWaterData {
        string level;
        string region;
        string timestamp;
        bool revealed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedWaterData) public encryptedData;
    mapping(uint256 => DecryptedWaterData) public decryptedData;

    mapping(string => euint32) private encryptedRegionCount;
    string[] private regionList;

    mapping(uint256 => uint256) private decryptionRequests;

    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event DataDecrypted(uint256 indexed id);

    modifier onlyContributor(uint256 dataId) {
        _;
    }

    /// @notice Submit encrypted groundwater data
    function submitEncryptedData(
        euint32 encryptedLevel,
        euint32 encryptedRegion,
        euint32 encryptedTimestamp
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;

        encryptedData[newId] = EncryptedWaterData({
            id: newId,
            encryptedLevel: encryptedLevel,
            encryptedRegion: encryptedRegion,
            encryptedTimestamp: encryptedTimestamp,
            submittedAt: block.timestamp
        });

        decryptedData[newId] = DecryptedWaterData({
            level: "",
            region: "",
            timestamp: "",
            revealed: false
        });

        emit DataSubmitted(newId, block.timestamp);
    }

    /// @notice Request decryption of a data entry
    function requestDataDecryption(uint256 dataId) public onlyContributor(dataId) {
        EncryptedWaterData storage entry = encryptedData[dataId];
        require(!decryptedData[dataId].revealed, "Already revealed");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(entry.encryptedLevel);
        ciphertexts[1] = FHE.toBytes32(entry.encryptedRegion);
        ciphertexts[2] = FHE.toBytes32(entry.encryptedTimestamp);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDataEntry.selector);
        decryptionRequests[reqId] = dataId;

        emit DecryptionRequested(dataId);
    }

    /// @notice Callback to handle decrypted data
    function decryptDataEntry(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = decryptionRequests[requestId];
        require(dataId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        DecryptedWaterData storage dEntry = decryptedData[dataId];

        require(!dEntry.revealed, "Already revealed");

        dEntry.level = results[0];
        dEntry.region = results[1];
        dEntry.timestamp = results[2];
        dEntry.revealed = true;

        if (!FHE.isInitialized(encryptedRegionCount[dEntry.region])) {
            encryptedRegionCount[dEntry.region] = FHE.asEuint32(0);
            regionList.push(dEntry.region);
        }

        encryptedRegionCount[dEntry.region] = FHE.add(
            encryptedRegionCount[dEntry.region],
            FHE.asEuint32(1)
        );

        emit DataDecrypted(dataId);
    }

    /// @notice Get decrypted data
    function getDecryptedData(uint256 dataId) public view returns (
        string memory level,
        string memory region,
        string memory timestamp,
        bool revealed
    ) {
        DecryptedWaterData storage entry = decryptedData[dataId];
        return (entry.level, entry.region, entry.timestamp, entry.revealed);
    }

    /// @notice Get encrypted region count
    function getEncryptedRegionCount(string memory region) public view returns (euint32) {
        return encryptedRegionCount[region];
    }

    /// @notice Request region count decryption
    function requestRegionCountDecryption(string memory region) public {
        euint32 count = encryptedRegionCount[region];
        require(FHE.isInitialized(count), "Region not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRegionCount.selector);
        decryptionRequests[reqId] = uint256(keccak256(abi.encodePacked(region)));
    }

    /// @notice Callback for decrypted region count
    function decryptRegionCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 regionHash = decryptionRequests[requestId];
        string memory region = hashToRegion(regionHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    // Helper functions
    function hashToRegion(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < regionList.length; i++) {
            if (uint256(keccak256(abi.encodePacked(regionList[i]))) == hash) {
                return regionList[i];
            }
        }
        revert("Region not found");
    }
}
