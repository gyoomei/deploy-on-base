// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DeployOnBase {
    address public immutable owner;
    string public projectName;
    string public tokenSymbol;
    uint256 public amount;
    string public description;
    string public imageUri;
    uint256 public createdAt;

    event ProjectUpdated(string projectName, string tokenSymbol, uint256 amount, string description, string imageUri);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        string memory _projectName,
        string memory _tokenSymbol,
        uint256 _amount,
        string memory _description,
        string memory _imageUri
    ) {
        owner = msg.sender;
        projectName = _projectName;
        tokenSymbol = _tokenSymbol;
        amount = _amount;
        description = _description;
        imageUri = _imageUri;
        createdAt = block.timestamp;
        emit ProjectUpdated(_projectName, _tokenSymbol, _amount, _description, _imageUri);
    }

    function updateProject(
        string calldata _projectName,
        string calldata _tokenSymbol,
        uint256 _amount,
        string calldata _description,
        string calldata _imageUri
    ) external onlyOwner {
        projectName = _projectName;
        tokenSymbol = _tokenSymbol;
        amount = _amount;
        description = _description;
        imageUri = _imageUri;
        emit ProjectUpdated(_projectName, _tokenSymbol, _amount, _description, _imageUri);
    }

    function summary()
        external
        view
        returns (
            address contractOwner,
            string memory name,
            string memory symbol,
            uint256 supply,
            string memory projectDescription,
            string memory image
        )
    {
        return (owner, projectName, tokenSymbol, amount, description, imageUri);
    }
}
