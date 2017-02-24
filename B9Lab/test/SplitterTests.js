// Xavier's helper to promisify web3 functions from https://gist.github.com/xavierlepretre/90f0feafccc07b267e44a87050b95caa
const PromisifyWeb3 = require("../build/promisifyWeb3.js");

// Xavier's helper function to promisify waiting for a transaction to be minded from the course notes or
web3.eth.getTransactionReceiptMined = function (txnHash, interval) {
    var transactionReceiptAsync;
    interval = interval ? interval : 500;
    transactionReceiptAsync = function(txnHash, resolve, reject) {
        try {
            var receipt = web3.eth.getTransactionReceipt(txnHash);
            if (receipt == null) {
                setTimeout(function () {
                    transactionReceiptAsync(txnHash, resolve, reject);
                }, interval);
            } else {
                resolve(receipt);
            }
        } catch(e) {
            reject(e);
        }
    };

    if (Array.isArray(txnHash)) {
        var promises = [];
        txnHash.forEach(function (oneTxHash) {
            promises.push(web3.eth.getTransactionReceiptMined(oneTxHash, interval));
        });
        return Promise.all(promises);
    } else {
        return new Promise(function (resolve, reject) {
                transactionReceiptAsync(txnHash, resolve, reject);
            });
    }
};

// Get the Promise of a Web3 getBalance() call based on Xavier's Get the Promise of Web3 accounts at https://gist.github.com/xavierlepretre/ed82f210df0f9300493d5ca79893806a
web3.eth.getBalancePromise = function(address) {
  return new Promise(function (resolve, reject) {
    web3.eth.getBalance(address, function(e, result) {
      if (e)
        reject(e);
      else
        resolve(result);
    });
  });
};

var AliceA = web3.eth.accounts[1],
    BobA   = web3.eth.accounts[2],
    CarolA = web3.eth.accounts[3];

// Check that there are at least 4 accounts for Owner, Alice, Bob, Carol
web3.eth.getAccounts(function(error, accs) {
  if (error)
    throw("Error fetching the accounts");
  describe('Account Tests', function() {
    it('There should be at least 4 accounts available for Owner, Alice, Bob, and Carol', function() {
      assert.isTrue(accs.length >= 4, "There are only " + accs.length + " accounts but >= 4 are needed");
    });
  });
});

// Check that Alice has a balance
web3.eth.getBalance(AliceA, function(error, result) {
  if (error)
    throw("Error fetching balance for Alice");
  describe("Alice should have a starting balance", function() {
    it('Alice starting balance should be > 0', function() {
      var bal = result.toNumber(); // wouldn't work if the balance were only a few wei but this will do for here
      assert.isTrue(bal > 0, "Alice starting balance is " + bal + " not > 0 as required");
    });
  });
});

// Check that Alice, Bob, and Carol have addresses and that they are correct
contract('Constructor Addresses Test', function() {
  it("Alice, Bob, and Carol should have accounts 1, 2, 3 addresses", function (done) {
    Splitter.deployed().getAliceAddress()
      .then(function (result) {
        assert.equal(result, AliceA, "getAliceAddress gives " + result + " not accounts[1] (" + AliceA + ") as expected");
        return Splitter.deployed().getBobAddress();
      })
      .then(function (result) {
        assert.equal(result, BobA, "getBobAddress gives " + result + " not accounts[2] (" + BobA + ") as expected");
        return Splitter.deployed().getCarolAddress();
      })
      .then(function (result) {
        assert.equal(result, CarolA, "getCarolAddress gives " + result + " not accounts[3] (" + CarolA + ") as expected");
        done(); // Test passed
      })
      .catch(done); // Test failed
  });
})

// Check split() for sending by Alice which should result in 50/50 -> Bob and Carol
// First get Bob and Carol's starting balances
{
var BobBalAnteBN, CarolBalAnteBN,
    BobBalPostBN, CarolBalPostBN;
web3.eth.getBalance(BobA, function(error, result) {
  if (error)
    throw("Error fetching balance for Bob");
  BobBalAnteBN = result;
  //console.log("Bob's starting balance = " + BobBalAnteBN);
  web3.eth.getBalance(CarolA, function(error, result) {
    if (error)
      throw("Error fetching balance for Carol");
    CarolBalAnteBN = result;
    //console.log("Carol's starting balance = " + CarolBalAnteBN);
    // Then carry on to do the split() test for which we can use promises
    contract('Split Test Alice', function() {
      it("Alice sends 7 wei to split() which should result in 3 -> Bob and 4 -> Carol", function () {
        return Splitter.deployed().split({from: AliceA, value: 7})
          .then(function (txHash) {
            return web3.eth.getTransactionReceiptMined(txHash);
          })
          .then(function() {
            // The split() trans has mined. Now check balances
            return web3.eth.getBalance(BobA);
          })
          .then(function(result) {
            BobBalPostBN = result;
            return web3.eth.getBalance(CarolA);
          })
          .then(function(result) {
            CarolBalPostBN = result;
            // console.log("BobBalAnteBN="+BobBalAnteBN +",CarolBalAnteBN="+CarolBalAnteBN);
            // console.log("BobBalPostBN="+BobBalPostBN+", CarolBalPostBN="+CarolBalPostBN);
            var expectedBN = BobBalAnteBN.plus(3);
            assert.isTrue(BobBalPostBN.equals(expectedBN), "Bob's balance after the split is " + BobBalPostBN + " not " + expectedBN + " as expected");
                expectedBN = CarolBalAnteBN.plus(4);
            assert.isTrue(CarolBalPostBN.equals(expectedBN), "Carol's balance after the split is " + CarolBalPostBN + " not " + expectedBN + " as expected");
          });
      }); // end it
    }); // end contract
  }); // end get Carol bal
}); // end get Bob bal
}

// Check split() for sending by other than Alice which should result in the sent amount -> contract
// First get the contract starting balances
var ContractA,
    ContractBalAnteBN,
    ContractBalPostBN;
contract('Split Test Not Alice', function() {
  it("Carol sends 7 wei to split() which should result in 7 -> the Contract", function () {
    ContractA = Splitter.address;
    return web3.eth.getBalancePromise(ContractA)
      .then(function (result) {
        ContractBalAnteBN = result;
        return Splitter.deployed().split({from: CarolA, value: 7})
      })
      .then(function (txHash) {
        return web3.eth.getTransactionReceiptMined(txHash);
      })
      .then(function() {
        // The split() trans has mined. Now check balances
        return web3.eth.getBalance(ContractA);
      })
      .then(function(result) {
        ContractBalPostBN = result;
        // console.log("ContractBalAnteBN="+ContractBalAnteBN);
        // console.log("ContractBalPostBN="+ContractBalPostBN);
        var expectedBN = ContractBalAnteBN.plus(7);
        assert.isTrue(ContractBalPostBN.equals(expectedBN), "Contract's balance after the split is " + ContractBalPostBN + " not " + expectedBN + " as expected");
      })
  }); // end it
}); // end contract
