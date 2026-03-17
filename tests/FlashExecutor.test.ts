import { expect } from "chai";
import { ethers } from "hardhat";

describe("FlashExecutor + MockFlashLoanProvider", function () {
  it("should accept flashloan and allow callback", async function () {
    const [deployer, user] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory(
      `contract MockERC20 {
        string public name = "Mock";
        string public symbol = "MCK";
        uint8 public decimals = 18;
        mapping(address=>uint256) public balanceOf;
        constructor(uint256 initial) { balanceOf[msg.sender] = initial; }
        function transfer(address to, uint256 amt) external returns(bool){ balanceOf[msg.sender]-=amt; balanceOf[to]+=amt; return true;}
        function approve(address, uint256) external pure returns(bool){ return true;}
      }`
    );
    const token = await ERC20.deploy(ethers.parseUnits("1000000", 18));
    await token.deployed();

    const MockProvider = await ethers.getContractFactory("MockFlashLoanProvider");
    const mockProvider = await MockProvider.deploy(token.target);
    await mockProvider.deployed();

    const FlashExecutor = await ethers.getContractFactory("FlashExecutor");
    const executor = await FlashExecutor.deploy(mockProvider.target);
    await executor.deployed();

    await expect(executor.connect(deployer).executeFlashloan(token.target, 1000, "0x")).to.not.be.reverted;
  });
});
