// 2017.02.21 Extensively revised following Xavier's comments about use of the global WhoA and WhoS plus the previous switch construction for setting who info
// 2017.02.22 Started on event handling, removed global address constants, added AllA instead
// 2017.02.24 Added use of getTransactionReceiptMined(); tidied up promises use in onload; fixed ending watch for constructor event
// 2017.02.27 Changed from push to pull pattern
// 2017.03.02 Corrected promise error handling

var Instance, // Splitter.deployed()
    AllA, // array of {whoS, whoA} objects
    Errors;

// Utility fns
// Add Xavier's helper function to wait for a transaction to be mined, to web3.eth
function AddGetTransactionReceiptMinedToWeb3() {
  web3.eth.getTransactionReceiptMined = function(txnHash, interval) {
    var transactionReceiptAsync;
    interval = interval ? interval : 500;
    transactionReceiptAsync = function(txnHash, resolve, reject) {
      try {
        var receipt = web3.eth.getTransactionReceipt(txnHash);
        if (receipt == null) {
          setTimeout(function() {
            transactionReceiptAsync(txnHash, resolve, reject);
          }, interval);
        }else{
          resolve(receipt);
        }
      } catch(e) {
        reject(e);
      }
    };

    if (Array.isArray(txnHash)) {
      var promises = [];
      txnHash.forEach(function(oneTxHash) {
        promises.push(web3.eth.getTransactionReceiptMined(oneTxHash, interval));
      });
      return Promise.all(promises);
    } else {
      return new Promise(function(resolve, reject) {
        transactionReceiptAsync(txnHash, resolve, reject);
      })
    }
  }
}

function SetStatus(msgS) {
  document.getElementById("Status").innerHTML = msgS;
};

function LogAndSetStatus(msgS) {
  console.log(msgS);
  SetStatus(msgS);
};

function SetStatusOnError(msgS, e) {
  msgS += " Error";
  console.log(msgS);
  console.error(""+e);
  SetStatus(msgS + " - see log");
}

function SetAddress(addrA, whoS) {
  document.getElementById(whoS+"Addr").innerHTML = addrA;
};

function GetWhoObj(whoI) {
  var whoO = AllA[whoI];
  if (whoO.whoA == null) {
    // Any
    var addS = document.getElementById("AnyAddr").value;
    if (!addS.length)
      SetStatus("Please enter a valid address for 'Anyone'");
    else
      whoO.whoA = addS; // no checking other than for zero length!
  }
  return whoO;
}

function SetBalance(whoI) {
  var whoO = GetWhoObj(whoI);
  if (!whoO.whoA) return; // Expected to happen only for Any with no address entered
  web3.eth.getBalance(whoO.whoA, function(e, result) {
    if (e) {
      Errors++;
      SetStatusOnError("Getting balance for " + whoO.whoS, e)
    }else
      document.getElementById(whoO.whoS + "Ethers").innerHTML = web3.fromWei(result, "ether");
  });
}

function RefreshBalances() {
  SetStatus("Refreshing balances...");
  Errors = 0;
  for (var iX=0; iX<=5; iX++) {
    SetBalance(iX);
    if (Errors) break;
  }
  if (!Errors)
    SetStatus("Balances refreshed");
};

function AddressToWho(aA) {
  for (var iX=0; iX<=5; iX++) {
    if (AllA[iX].whoA == aA)
      return AllA[iX].whoS;
  }
  // Not known
  return aA;
}

// Button click fns
function Refresh() {
  RefreshBalances();
}

function Send(fromNumS) {
  var amtD;
  var whoI = Number(fromNumS);
  var whoO = GetWhoObj(whoI);
  if (!whoO.whoA) return; // null in the Any case with no address
  // Xavier: You can stay with strings since Web3 will convert strings to big numbers anyway.
  // But left as it was for the bit of basic input validation performed
  amtD = parseFloat(document.getElementById(whoO.whoS + "Amt").value);
  if (isNaN(amtD) || amtD <= 0.0) {
    SetStatus("Please enter a positive non-zero 'Ethers to Send' number to send from " + whoO.whoS);
    return;
  }
  var msgS = "Sending " + amtD + " ethers to Splitter.split() from " + whoO.whoS;
  LogAndSetStatus(msgS);
//Instance.split({from: whoO.whoA, value: web3.toWei(amtD, "ether"), gas: 1000000 })
  Instance.split({from: whoO.whoA, value: web3.toWei(amtD, "ether")})
  .then(function(txHash) {
    console.log("Split Tx: " + txHash);
    return web3.eth.getTransactionReceiptMined(txHash);
  })
  .then(function() {
    // The split() trans has been mined
    console.log("Send to split() completed");
    if (whoI == 2) {
      // The send was from Alice, so a split to Bob and Carol would have been performed. Do the withdrawal for Bob, but not Carol, leaving Carol to hit her Withdraw button to get hers
      console.log("A split from Alice has been performed. Now withdraw Bob's share");
      msgS = "Withdrawing for Bob";
      Instance.withdraw({from: AllA[3].whoA}) // Bob
      .then(txHash => {
        console.log("Bob withdrawal Tx: " + txHash);
        return web3.eth.getTransactionReceiptMined(txHash);
      })
      .then(function() {
        // The withdraw() trans has been mined. Now update all balances
        console.log("Withdrawal for Bob completed");
        RefreshBalances();
        SetStatus("Transaction complete!");
      }).catch(e => SetStatusOnError(msgS, e));
    }else{
      // The send was from other than Alice so no split would have happened. Just refresh
      RefreshBalances();
      SetStatus("Transaction complete!");
    }
  }).catch(e => SetStatusOnError(msgS, e));
}

// Fn for Carol to withdraw any pending withdrawal amounts for her
function CarolPull() {
  var msgS = "Doing a withdrawal check for Carol";
  LogAndSetStatus(msgS);
  carolA = AllA[4].whoA;
  // See if there is anything to withdraw
  Instance.withdraw.call({from: carolA}) // .call() to get bool return and no transaction
  .then(availB => {
    if (availB) {
      // A withdrawal is available
      console.log("There is a withdrawal available");
      msgS = "Withdrawing for Carol";
      Instance.withdraw({from: carolA}) // do it i.e. not .call()
      .then(txHash => {
        console.log("Carol withdrawal Tx: " + txHash);
        return web3.eth.getTransactionReceiptMined(txHash);
      })
      .then(function() {
        // The withdraw() trans has been mined. Now update Carol's balance
        SetBalance(4);
        LogAndSetStatus("Withdrawal for Carol completed");
      }).catch(e => SetStatusOnError(msgS, e));
    }else
      LogAndSetStatus("Nothing is available for withdrawal");
  }).catch(e => SetStatusOnError(msgS, e));
}

// Event fns
window.onload = function() {
  AddGetTransactionReceiptMinedToWeb3();
  var contractA, ownerA, aliceA, bobA, carolA; // Addresses
  Instance = Splitter.deployed();
  // Addresses
  // This method of getting the contract address works but it gives a warning:
  // Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check
  // What function can be used?
  contractA = Splitter.address;
  SetAddress(contractA, "Contract");

  var msgS = "Getting Splitter version";
  Instance.getVersion.call()
  .then(result => {
    document.getElementById("Version").innerHTML = result;
    msgS = "Getting Owner address";
    return Instance.getOwnerAddress.call();
  })
  .then(function(result) {
    SetAddress(ownerA = result, "Owner");
    msgS = "Getting Alice address";
    return Instance.getAliceAddress.call();
  })
  .then(result => {
    SetAddress(aliceA = result, "Alice");
    msgS = "Getting Bob address";
    return Instance.getBobAddress.call();
  })
  .then(result => {
    SetAddress(bobA = result, "Bob");
    msgS = "Getting Carol address";
    return Instance.getCarolAddress.call();
  })
  .then(result => {
    SetAddress(carolA = result, "Carol");
    // All addresses loaded
    AllA = [
      { whoS: "Contract", whoA: contractA }, // 0
      { whoS: "Owner", whoA: ownerA },       // 1 account 0
      { whoS: "Alice", whoA: aliceA },       // 2         1
      { whoS: "Bob",   whoA: bobA   },       // 3         2
      { whoS: "Carol", whoA: carolA },       // 4         3
      { whoS: "Any",   whoA: null   }        // 5
    ];
    RefreshBalances();
    LogContractCreation();
    LogSplits();
    LogSplitReceipts();
    LogFallbackReceipts();
    LogWithdrawals();
  }).catch(e => SetStatusOnError(msgS, e));
} // end onload

/* Event handlers
  event OnCreation(address OwnerA, uint EthersU, address AliceA, address BobA, address CarolA); // Constructor
  event OnFallbackReceipt(address SenderA, uint WeiSentU); // Received from sender via fallback fn if non-zero
  event OnSplitReceipt(   address SenderA, uint WeiSentU); // Received from sender via a non-zero transaction to split()
  event OnSplit(address SenderA, uint WeiSentU, uint WeiToBobU, uint WeiToCarolU); // Split on send from Alice, half to Bob, other half to Carol
  event OnWithdrawal(address SenderA, uint WeiWithdrawnU); // Withdrawal by sender
*/

function LogContractCreation() {
  var onCreation = Instance.OnCreation();
  onCreation.watch(function(e, value) {
    if (e)
      console.error(e);
    else{
      console.log("Constructor: Owner " + value.args.OwnerA + " plus addresses " + value.args.AliceA +
                  ", " + value.args.BobA + ", " + value.args.CarolA + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
      console.log("Or Constructor: " + AddressToWho(value.args.OwnerA) + " plus addresses for " + AddressToWho(value.args.AliceA) +
                  ", " + AddressToWho(value.args.BobA) + ", " + AddressToWho(value.args.CarolA) + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
    }
    onCreation.stopWatching();
  });
}

function LogFallbackReceipts() {
  Instance.OnFallbackReceipt()
    .watch(function(e, value) {
      if (e)
        console.error(e);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent to contract from " + AddressToWho(value.args.SenderA) + " via fallback");
    });
}

function LogSplitReceipts() {
  Instance.OnSplitReceipt()
    .watch(function(e, value) {
      if (e)
        console.error(e);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent to contract from " + AddressToWho(value.args.SenderA) + " via split()");
    });
}

function LogSplits() {
  Instance.OnSplit()
    .watch(function(e, value) {
      if (e)
        console.error(e);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent from " + AddressToWho(value.args.SenderA) + " to split() split as " +
                    web3.fromWei(value.args.WeiToBobU, "ether") + " ethers to Bob and " +
                    web3.fromWei(value.args.WeiToCarolU, "ether") + " ethers to Carol");
    });
}

function LogWithdrawals() {
  Instance.OnWithdrawal()
    .watch(function(e, value) {
      if (e)
        console.error(e);
      else
        console.log(web3.fromWei(value.args.WeiWithdrawnU, "ether") + " ethers withdrawn by " + AddressToWho(value.args.SenderA));
    });
}
