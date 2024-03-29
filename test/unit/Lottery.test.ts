import { assert, expect } from "chai";
import { network, deployments, ethers, getNamedAccounts } from "hardhat";
import { developmentChains } from "../../helper-hardhat.config";
import { Lottery, VRFCoordinatorV2Mock } from "../../typechain";
import { BigNumber } from "ethers";

// TODO: add tests for entranceFee calc, endLottery, disperseFunds, enter, security checks, etc.

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", function () {
      let lottery: Lottery;
      let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock;
      let signers: any[];
      let entranceFee: BigNumber;

      beforeEach(async () => {
        await deployments.fixture(["mocks", "lottery"]);
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        lottery = await ethers.getContract("Lottery");
        console.log(lottery.address, "lottery address");
        await lottery.startLottery();

        entranceFee = await lottery.getEntranceFee();
        await lottery.enter({ value: entranceFee });

        signers = await ethers.getSigners();
        const [, guy1, guy2] = signers; // bypassing named accounts

        await lottery.connect(guy1).enter({ value: entranceFee });
        await lottery.connect(guy2).enter({ value: entranceFee });
      });

      it("Should test the entrance fee and enter func()", async () => {
        const { deployer } = await getNamedAccounts();
        const [, guy1, guy2] = signers;
        expect(await lottery.s_participants(0)).to.equal(deployer);
        expect(await lottery.s_addressToAmountDeposited(deployer)).to.equal(
          entranceFee
        );
        expect(await lottery.s_participants(1)).to.equal(guy1.address);
        expect(await lottery.s_addressToAmountDeposited(guy1.address)).to.equal(
          entranceFee
        );
        expect(await lottery.s_participants(2)).to.equal(guy2.address);
        expect(await lottery.s_addressToAmountDeposited(guy2.address)).to.equal(
          entranceFee
        );

        await expect(lottery.enter()).to.be.revertedWith(
          "Lottery__SendMoreToEnterLottery"
        );
      });

      it("Should successfully request random words", async () => {
        await expect(lottery.endLottery()).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );
      });

      it("Should successfully request random words and select a winner", async () => {
        const [, , guy2] = signers;
        const lotteryBalanceBeforeEnding = await ethers.provider.getBalance(
          lottery.address
        );
        const winnerBalanceBeforeEnding = await ethers.provider.getBalance(
          guy2.address
        ); //* recent winner is predictable in the mock.

        await lottery.endLottery();
        const s_requestId = await lottery.s_requestId();
        //   console.log(s_requestId.toString(), "s_requestId")
        // notes: promise could be used here.
        // simulate callback from the oracle network
        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(s_requestId, lottery.address)
        ).to.emit(lottery, "WinnerGotMoney");
        //   const som = await vrfCoordinatorV2Mock.fulfillRandomWords(s_requestId, lottery.address)
        //   const somtx = await som.wait(1)
        //   console.log("\n",somtx)
        //   console.log('\nLog Topics',somtx.logs[1].topics)
        //   console.log('\n', somtx.events[1].args)
        //   console.log('\n', somtx.events[1].args.s_requestId.toString())
        //   console.log('\n', somtx.events[1].args.outputSeed.toString())
        //   console.log('\n', somtx.events[1].args.payment.toString())

        assert((await lottery.s_participants.length) === 0);
        //   console.log(await lottery.lotteryState(), "lotteryState ( 1 means closed )")
        //   console.log(await lottery.s_participants.length, "s_participants length")
        //   //*     uint256[] memory words = new uint256[](req.numWords);
        //   //*       for (uint256 i = 0; i < req.numWords; i++) {
        //   //*         words[i] = uint256(keccak256(abi.encode(_requestId, i)));
        //   //*     }    LINE 71 -74 IN VRFCoordinatorV2Mock.sol
        //   //NOTES: Due to above mock vrf always returns the same random number based on the s_requestId & index
        const s_recentWinner = await lottery.s_recentWinner();
        expect(s_recentWinner).to.equal(guy2.address);

        const winnerBalanceAfterEnding = await ethers.provider.getBalance(
          s_recentWinner
        );
        const lotteryBalanceAfterEnding = await ethers.provider.getBalance(
          lottery.address
        );
        assert(lotteryBalanceAfterEnding.toString() === "0");
        const winnersCut = (lotteryBalanceBeforeEnding.div(100)).mul(80);
        expect(winnerBalanceAfterEnding).to.equal(
          winnerBalanceBeforeEnding.add(winnersCut)
        );
        console.log("\n\n");
        console.log(
          ethers.utils.formatEther(winnerBalanceBeforeEnding),
          "winner balance before ending lottery!"
        );
        console.log(
          ethers.utils.formatEther(winnerBalanceAfterEnding),
          "winner balance after ending lottery!"
        );
        console.log(
          ethers.utils.formatEther(lotteryBalanceBeforeEnding),
          "lottery balance before ending lottery!"
        );
        console.log(
          ethers.utils.formatEther(lotteryBalanceAfterEnding),
          "lottery balance after ending lottery!"
        );
        console.log("\n");
      });

      it("Should be able to change the minParticipantsLimit", async () => {
        const tx = await lottery.setMinParticipantsLimit(5);
        await tx.wait(1);
        expect(await lottery.s_minParticpantsLimit()).to.equal(5);
      });

      it("Should emit event when a particiapnt enters", async () => {
        const currentParticipantsLength = await lottery.getParticipantsLen();
        const newGuy = signers[currentParticipantsLength.toNumber()];

        await expect(
          lottery.connect(newGuy).enter({ value: entranceFee })
        ).to.emit(lottery, "PlayerEnteredLottery");
      });

      it("Should avoid duplicating elements in participants array", async () => {
        const { deployer } = await getNamedAccounts();
        const participantsLenBefore = lottery.s_participants.length;
        assert(await lottery.s_isParticipant(deployer));
        await lottery.enter({ value: entranceFee });
        const participantsLenAfter = lottery.s_participants.length;
        assert(participantsLenAfter === participantsLenBefore);
      });

      it("Should reset arrays and relevant mappings when ending lottery", async () => {
        const { deployer } = await getNamedAccounts();

        await new Promise(async (resolve, reject) => {
          lottery.once("WinnerGotMoney", async () => {
            console.info("Winner got the Money! Should reset.");
            try {
              assert((await lottery.s_isParticipant(deployer)) === false);
              assert((await lottery.getParticipantsLen()).toNumber() === 0);
              assert((await lottery.s_lotteryState()) === 1);
              resolve(true);
            } catch (err) {
              console.error(err);
              reject();
            }
          });

          const tx = await lottery.endLottery();
          await tx.wait(1);
          const s_requestId = await lottery.s_requestId();

          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(
              s_requestId,
              lottery.address
            )
          ).to.emit(lottery, "WinnerGotMoney");
        });
      });

      it("Should be able to enter when new round begins", async () => {
        const { deployer } = await getNamedAccounts();
        await (await lottery.endLottery()).wait(1);
        const s_requestId = await lottery.s_requestId();
        await (
          await vrfCoordinatorV2Mock.fulfillRandomWords(
            s_requestId,
            lottery.address
          )
        ).wait(1);

        await (await lottery.startLottery()).wait(1);
        assert((await lottery.s_lotteryState()) === 0);

        assert((await lottery.s_isParticipant(deployer)) === false);
        await lottery.enter({ value: entranceFee });
        assert((await lottery.getParticipantsLen()).toNumber() === 1);
        assert((await lottery.s_isParticipant(deployer)) === true);
      });

      it("disperseFunds should work as a backup function", async () => {
        const lotteryBalanceBeforeEnding = await ethers.provider.getBalance(
          lottery.address
        );
        const { deployer } = await getNamedAccounts();
        const ownerBalanceBeforeEnding = await ethers.provider.getBalance(
          deployer
        );
        const winnerBalanceBeforeEnding = await ethers.provider.getBalance(
          await lottery.s_recentWinner()
        );
        
        (await lottery.disperseFunds()).wait();

        const ownerBalanceAfterEnding = await ethers.provider.getBalance(
          deployer
        );
        const winnerBalanceAfterEnding = await ethers.provider.getBalance(
          await lottery.s_recentWinner()
        );
        const lotteryBalanceAfterEnding = await ethers.provider.getBalance(
          lottery.address
        );
        assert(lotteryBalanceAfterEnding.toString() === "0");
        const winnersCut = (lotteryBalanceBeforeEnding.div(100)).mul(80);

        expect(winnerBalanceAfterEnding).to.equal(
          winnerBalanceBeforeEnding.add(winnersCut)
        );

        console.log("winnersCut", ethers.utils.formatEther(winnersCut.toString()));
        console.log("ownerBalanceBeforeEnding", ethers.utils.formatEther(ownerBalanceBeforeEnding.toString()));
        console.log("ownerBalanceAfterEnding", ethers.utils.formatEther(ownerBalanceAfterEnding.toString()));

   
      })
    });
