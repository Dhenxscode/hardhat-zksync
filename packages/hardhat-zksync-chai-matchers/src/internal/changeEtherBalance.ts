import type { BigNumberish, BigNumber, ethers } from "ethers";
import { TransactionResponse } from "zksync-web3/build/src/types";
import * as zk from "zksync-web3";

import { buildAssert } from "@nomicfoundation/hardhat-chai-matchers/utils";
import { ensure } from "@nomicfoundation/hardhat-chai-matchers/internal/calledOnContract/utils";
import { Account, getAddressOf } from "./misc/account";
import { BalanceChangeOptions } from "./misc/balance";
import { Deferrable } from "ethers/lib/utils";

export function supportChangeEtherBalance(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    "changeEtherBalance",
    function (
      this: any,
      account: Account | string,
      balanceChange: BigNumberish,
      options?: BalanceChangeOptions,
      withOverrides?: ethers.Overrides
    ) {
      const { BigNumber } = require("ethers");

      // capture negated flag before async code executes; see buildAssert's jsdoc
      const negated = this.__flags.negate;
      const subject = this._obj;
      const amount = BigNumber.from(balanceChange).abs();

      const checkBalanceChange = ([actualChange, address]: [
        typeof BigNumber,
        string
      ]) => {
        const assert = buildAssert(negated, checkBalanceChange);

        assert(
          actualChange.eq(BigNumber.from(balanceChange)),
          `Expected the ether balance of "${address}" to change by ${balanceChange.toString()} wei, but it changed by ${actualChange.toString()} wei`,
          `Expected the ether balance of "${address}" NOT to change by ${balanceChange.toString()} wei, but it did`
        );
      };

      const derivedPromise = Promise.all([
        getBalanceChange(subject, account, amount, options, withOverrides),
        getAddressOf(account),
      ]).then(checkBalanceChange);
      this.then = derivedPromise.then.bind(derivedPromise);
      this.catch = derivedPromise.catch.bind(derivedPromise);
      this.promise = derivedPromise;
      return this;
    }
  );
}

export async function getBalanceChange(
  transaction:
    // | Deferrable<zk.types.TransactionRequest> 
    // | (() => Deferrable<zk.types.TransactionRequest>),
    | zk.types.TransactionResponse
    | Promise<zk.types.TransactionResponse>
    | (() =>
      | Promise<zk.types.TransactionResponse>
      | zk.types.TransactionResponse),
  account: Account | string,
  amount: BigNumber,
  options?: BalanceChangeOptions,
  overrides?: ethers.Overrides
) {
  const { BigNumber } = await import("ethers");
  const hre = await import("hardhat");

  const provider = new zk.Provider(hre.config.zkSyncDeploy.zkSyncNetwork);

  let txResponse: zk.types.TransactionResponse;

  if (typeof transaction === "function") {
    txResponse = await transaction();
  } else {
    txResponse = await transaction;
  }

  const txReceipt = await txResponse.wait();
  const txBlockNumber = txReceipt.blockNumber;

  const block = await provider.send("eth_getBlockByHash", [
    txReceipt.blockHash,
    false,
  ]);

  ensure(
    block.transactions.length === 1,
    Error,
    "Multiple transactions found in block"
  );

  const address = await getAddressOf(account);

  const balanceAfter = await provider.send("eth_getBalance", [
    address,
    `0x${txBlockNumber.toString(16)}`,
  ]);

  const balanceBefore = await provider.send("eth_getBalance", [
    address,
    `0x${(txBlockNumber - 1).toString(16)}`,
  ]);

  if (options?.includeFee !== true && address === txResponse.from) {
    // const gasPrice = txReceipt.effectiveGasPrice ?? txResponse.gasPrice;
    // const gasUsed = txReceipt.gasUsed;
    // const txFee = gasPrice.mul(gasUsed);

    let gasPrice;
    if (overrides?.maxFeePerGas) {
      gasPrice = BigNumber.from(overrides?.maxFeePerGas);
    } else {
      gasPrice = await provider.getGasPrice();
    }
    // const gasUsed = await provider.estimateGasTransfer({ 
    //   from: txReceipt.from, 
    //   to: txReceipt.to, 
    //   amount
    // });
    // const gasUsed = await provider.estimateGas(txResponse as Deferrable<zk.types.TransactionRequest>);
    const gasUsed = await provider.estimateGasTransfer({
      to: txReceipt.to,
      from: txReceipt.from,
      amount,
      overrides
    });
    const txFee = gasPrice.mul(gasUsed);

    return BigNumber.from(balanceAfter).add(txFee).sub(balanceBefore);
  } else {
    return BigNumber.from(balanceAfter).sub(balanceBefore);
  }
}
