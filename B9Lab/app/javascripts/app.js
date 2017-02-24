// 2017.02.21 Extensively revised following Xavier's comments about use of the global WhoA and WhoS plus the previous switch construction for setting who info
// 2017.02.22 Started on event handling, removed global address constants, added AllA instead
// 2017.02.24 Added use of getTransactionReceiptMined(); tidied up promises use in onload; fixed ending watch for constructor event

var SdepFn; // Splitter.deployed()
var AllA; // array of {whoS, whoA} objects
var Errors;

// Utility fns
function SetStatus(msgS) {
  document.getElementById("Status").innerHTML = msgS;
};

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

function AddressToWho(aA) {
  for (var iX=0; iX<=5; iX++) {
    if (AllA[iX].whoA == aA)
      return AllA[iX].whoS;
  }
  // Not known
  return aA;
}

function SetBalance(whoI) {
  var whoO = GetWhoObj(whoI);
  if (!whoO.whoA) return; // Expected to happen only for Any with no address entered
  web3.eth.getBalance(whoO.whoA, function(error, result) {
    if (!error)
      document.getElementById(whoO.whoS + "Ethers").innerHTML = web3.fromWei(result, "ether");
    else {
      Errors++;
      var msgS = "Error getting balance for " + whoO.whoS;
      console.error(msgS+": "+error);
      SetStatus(msgS+" - see log.");
    }
  });
}

function RefreshBalances() {
  SetStatus("Refreshing balances...");
  Errors = 0;
  for (var iX=0; iX<=5; iX++)
    SetBalance(iX);
  if (!Errors)
    SetStatus("Balances refreshed");
};

// Button click fns
function Refresh() {
  RefreshBalances();
}

function Send(fromNumS) {
  var amtD;
  var whoO = GetWhoObj(Number(fromNumS));
  if (!whoO.whoA) return; // null in the Any case with no address
  // Xavier: You can stay with strings since Web3 will convert strings to big numbers anyway.
  // But left as it was for the bit of basic input validation performed
  amtD = parseFloat(document.getElementById(whoO.whoS + "Amt").value);
  if (isNaN(amtD) || amtD <= 0.0) {
    SetStatus("Please enter a positive non-zero 'Ethers to Send' number to send from " + whoO.whoS);
    return;
  }
  var msgS = "Sending " + amtD + " ethers to Splitter.split() from " + whoO.whoS;
  SetStatus(msgS + " ... (Hold on while this transaction is added to the blockchain if it is valid.)");
  console.log(msgS);
//SdepFn.split({from: whoO.whoA, value: web3.toWei(amtD, "ether"), gas: 1000000 }).then(function(result) {
  SdepFn.split({from: whoO.whoA, value: web3.toWei(amtD, "ether")})
  .then(function(txHash) {
    console.log("Result: " + txHash);
    return web3.eth.getTransactionReceiptMined(txHash);
  }, function(e) {
    console.error(""+e);
    SetStatus("Error " + msgS + " - see log.");
  })
  .then(function() {
    // The split() trans has been mined. Now update balances
    RefreshBalances();
    SetStatus("Transaction complete!");
  })
}

// Event fns
window.onload = function() {
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
        }else{
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
  var contractA, ownerA, aliceA, bobA, carolA; // Addresses
  SdepFn = Splitter.deployed();
  // Addresses
  // This method of getting the contract address works but it gives a warning:
  // Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check
  // What function can be used?
  contractA = Splitter.address;
  SetAddress(contractA, "Contract");

  SdepFn.getVersion.call()
  .then(function(result) {
    document.getElementById("Version").innerHTML = result;
    return SdepFn.getOwnerAddress.call();
  }, function(e) {
    console.error(""+e);
    SetStatus("Error getting Splitter version");
  })
  .then(function(result) {
    SetAddress(ownerA = result, "Owner");
    return SdepFn.getAliceAddress.call();
  }, function(e) {
    console.error(""+e);
    SetStatus("Error getting Owner address");
  })
  .then(function(result) {
    SetAddress(aliceA = result, "Alice");
    return SdepFn.getBobAddress.call();
  }, function(e) {
    console.error(""+e);
    SetStatus("Error getting Alice address");
  })
  .then(function(result) {
    SetAddress(bobA = result, "Bob");
    return SdepFn.getCarolAddress.call();
  }, function(e) {
    console.error(""+e);
    SetStatus("Error getting Bob address");
  })
  .then(function(result) {
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
    LogContractCreationEvents();
    LogSplitEvents();
    LogSplitReceiptEvents();
    LogFallbackReceiptEvents();
  }, function(e) {
    console.error(""+e);
    SetStatus("Error getting Carol address");
  });
} // end onload

/* Event handlers
  event OnCreation(address OwnerA, uint EthersU, address AliceA, address BobA, address CarolA); // Constructor
  event OnFallbackReceipt(address SenderA, uint WeiSentU); // Received from sender via fallback fn if non-zero
  event OnSplitReceipt(   address SenderA, uint WeiSentU); // Received from sender via a non-zero transaction to split()
  event OnSplit(address SenderA, uint WeiSentU, uint WeiToBobU, uint WeiToCarolU); // Split on send from Alice, half to Bob, other half to Carol
*/

function LogContractCreationEvents() {
  var onCreation = Splitter.deployed().OnCreation();
  onCreation.watch(function (error, value) {
    if (error)
      console.error(error);
    else{
      console.log("Constructor: Owner " + value.args.OwnerA + " plus addresses " + value.args.AliceA +
                  ", " + value.args.BobA + ", " + value.args.CarolA + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
      console.log("Or Constructor: " + AddressToWho(value.args.OwnerA) + " plus addresses for " + AddressToWho(value.args.AliceA) +
                  ", " + AddressToWho(value.args.BobA) + ", " + AddressToWho(value.args.CarolA) + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
    }
    onCreation.stopWatching();
  });
}

function LogFallbackReceiptEvents() {
  Splitter.deployed().OnFallbackReceipt()
    .watch(function (error, value) {
      if (error)
        console.error(error);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent to contract from " + AddressToWho(value.args.SenderA) + " via fallback");
    });
}

function LogSplitReceiptEvents() {
  Splitter.deployed().OnSplitReceipt()
    .watch(function (error, value) {
      if (error)
        console.error(error);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent to contract from " + AddressToWho(value.args.SenderA) + " via Split()");
    });
}

function LogSplitEvents() {
  Splitter.deployed().OnSplit()
    .watch(function (error, value) {
      if (error)
        console.error(error);
      else
        console.log(web3.fromWei(value.args.WeiSentU, "ether") + " ethers sent from " + AddressToWho(value.args.SenderA) + " to Split() split as " +
                    web3.fromWei(value.args.WeiToBobU, "ether") + " ethers to Bob and " +
                    web3.fromWei(value.args.WeiToCarolU, "ether") + " ethers to Carol");
    });
}

