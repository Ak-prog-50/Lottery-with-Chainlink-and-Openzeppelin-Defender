import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import '@openzeppelin/hardhat-upgrades';

dotenv.config();

const timestamp = Date.now()

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6"
      }
    ],
  },
  networks: {
    ganache: {
      url: "HTTP://127.0.0.1:7545",
    },
    truffle: {
      url: "http://localhost:24012/rpc",
      chainId: 80001
    },
    localhost: {
      chainId: 31337
    },
    hardhat: {
      chainId: 31337
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: process.env.COIN_MARKET_CAP_API_KEY,
    outputFile: `gas-report${timestamp}.txt`,
    noColors: true
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      goerli: process.env.ETHERSCAN_API_KEY,
      polygon: process.env.POLYGONSCAN_API_KEY,
      polygonMumbai: process.env.POLYGONSCAN_API_KEY,
    }
  },
  namedAccounts: {
    deployer: {
      default: 0,
    }
  },
  mocha: {
    timeout: 200000, // 200 seconds
  }
};

export default config;
