import { AssertionError, expect } from "chai";
import { ProviderError } from "hardhat/internal/core/providers/errors";
import * as zk from "zksync-web3";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy/src/deployer";
import path from "path";
import util from "util";

import {
  runSuccessfulAsserts,
  runFailedAsserts,
  useEnvironmentWithLocalSetup
} from "../helpers";

import "../../src/internal/add-chai-matchers";

const RICH_WALLET_PK = "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110";

describe("INTEGRATION: Reverted without reason", function () {
  let matchers: zk.Contract;
  let provider: zk.Provider;
  let wallet: zk.Wallet;
  let deployer: Deployer;

  describe("with the in-process hardhat network", function () {
    useEnvironmentWithLocalSetup("hardhat-project");

    runTests();
  });

  function runTests() {
    beforeEach("deploy matchers contract", async function () {
      provider = new zk.Provider(this.hre.config.zkSyncDeploy.zkSyncNetwork);
      wallet = new zk.Wallet(RICH_WALLET_PK, provider);
      deployer = new Deployer(this.hre, wallet);

      const artifact = await deployer.loadArtifact("Matchers");
      matchers = await deployer.deploy(artifact);
    });

    // helpers
    describe("calling a method that succeeds", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "succeeds",
          successfulAssert: (x) => expect(x).not.to.be.revertedWithoutReason(),
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "succeeds",
          failedAssert: (x) => expect(x).to.be.revertedWithoutReason(),
          failedAssertReason:
            "Expected transaction to be reverted without a reason, but it didn't revert",
        });
      });
    });

    // depends on a bug being fixed on ethers.js
    // see https://linear.app/nomic-foundation/issue/HH-725
    describe.skip("calling a method that reverts without a reason", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertsWithoutReason",
          args: [],
          successfulAssert: (x) => expect(x).to.be.revertedWithoutReason(),
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertsWithoutReason",
          args: [],
          failedAssert: (x) => expect(x).to.not.be.revertedWithoutReason(),
          failedAssertReason:
            "Expected transaction NOT to be reverted without a reason, but it was",
        });
      });
    });

    describe("calling a method that reverts with a reason", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertsWith",
          args: ["some reason"],
          successfulAssert: (x) => expect(x).to.not.be.revertedWithoutReason(),
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertsWith",
          args: ["some reason"],
          failedAssert: (x) => expect(x).to.be.revertedWithoutReason(),
          failedAssertReason:
            "Expected transaction to be reverted without a reason, but it reverted with reason 'some reason'",
        });
      });
    });

    describe("calling a method that reverts with a panic code", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "panicAssert",
          successfulAssert: (x) => expect(x).to.not.be.revertedWithoutReason(),
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "panicAssert",
          failedAssert: (x) => expect(x).to.be.revertedWithoutReason(),
          failedAssertReason:
            "Expected transaction to be reverted without a reason, but it reverted with panic code 0x01 (Assertion error)",
        });
      });
    });

    describe("calling a method that reverts with a custom error", function () {
      it("successful asserts", async function () {
        await runSuccessfulAsserts({
          matchers,
          method: "revertWithSomeCustomError",
          successfulAssert: (x) => expect(x).to.not.be.revertedWithoutReason(),
        });
      });

      it("failed asserts", async function () {
        await runFailedAsserts({
          matchers,
          method: "revertWithSomeCustomError",
          failedAssert: (x) => expect(x).to.be.revertedWithoutReason(),
          failedAssertReason:
            "Expected transaction to be reverted without a reason, but it reverted with a custom error",
        });
      });
    });

    describe("invalid values", function () {
      it("non-errors as subject", async function () {
        await expect(
          expect(Promise.reject({})).to.be.revertedWithoutReason()
        ).to.be.rejectedWith(AssertionError, "Expected an Error object");
      });

      it("errors that are not related to a reverted transaction", async function () {
        // use an address that almost surely doesn't have balance
        const signer = zk.Wallet.createRandom().connect(provider);

        // this transaction will fail because of lack of funds, not because of a
        // revert
        await expect(
          expect(
            matchers.connect(signer).revertsWithoutReason({
              gasLimit: 1_000_000,
            })
          ).to.not.be.revertedWithCustomError(matchers, "SomeCustomError")
        ).to.be.eventually.rejectedWith(
          Error,
          "Failed to submit transaction: Not enough balance to cover the fee."
        );
      });
    });

    describe("stack traces", function () {
      // smoke test for stack traces
      it("includes test file", async function () {
        try {
          await expect(
            matchers.revertsWithoutReason()
          ).to.not.be.revertedWithoutReason();
        } catch (e: any) {
          expect(util.inspect(e)).to.include(
            path.join("test", "reverted", "revertedWithoutReason.ts")
          );

          return;
        }

        expect.fail("Expected an exception but none was thrown");
      });
    });
  }
});
