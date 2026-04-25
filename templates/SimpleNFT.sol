// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleNFT {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => string) public tokenURI;
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }
    
    function mint(address to, string memory uri) external returns (uint256) {
        uint256 tokenId = totalSupply;
        totalSupply++;
        ownerOf[tokenId] = to;
        balanceOf[to]++;
        tokenURI[tokenId] = uri;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
    
    function transfer(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "Not owner");
        balanceOf[msg.sender]--;
        balanceOf[to]++;
        ownerOf[tokenId] = to;
        emit Transfer(msg.sender, to, tokenId);
    }
}
