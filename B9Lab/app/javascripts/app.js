// 2017.02.21 Extensively revised following Xavier's comments about use of the global WhoA and WhoS plus the previous switch construction for setting who info
// 2017.02.22 Started on event handling, removed global address constants, added AllA instead

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
  SdepFn.split({from: whoO.whoA, value: web3.toWei(amtD, "ether")}).then(function(result) {
    console.log("Result: " + result);
    SetStatus("Transaction complete!");
    RefreshBalances();
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error " + msgS + " - see log.");
  });
};

// Event fns
window.onload = function() {
  var contractA, ownerA, aliceA, bobA, carolA; // Addresses
  SdepFn = Splitter.deployed();
  // Addresses
  // This method of getting the contract address works but it gives a warning:
  // Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check
  // What function can be used?
  contractA = Splitter.address;
  SetAddress(contractA, "Contract");

  SdepFn.getVersion.call().then(function(result) {
    document.getElementById("Version").innerHTML = result;
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Splitter version");
    return;
  });

  SdepFn.getOwnerAddress.call().then(function(result) {
    ownerA = result;
    SetAddress(ownerA, "Owner");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Owner address");
    return;
  });

  SdepFn.getAliceAddress.call().then(function(result) {
    aliceA = result;
    SetAddress(aliceA, "Alice");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Alice address");
    return;
  });

  SdepFn.getBobAddress.call().then(function(result) {
    bobA = result;
    SetAddress(bobA, "Bob");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Bob address");
    return;
  });

  SdepFn.getCarolAddress.call().then(function(result) {
    SetAddress(carolA = result, "Carol");
    // LoadedB = true;
    AllA = [
      { whoS: "Contract", whoA: contractA }, // 0
      { whoS: "Owner", whoA: ownerA },       // 1 account 0
      { whoS: "Alice", whoA: aliceA },       // 2         1
      { whoS: "Bob",   whoA: bobA   },       // 3         2
      { whoS: "Carol", whoA: carolA },       // 4         3
      { whoS: "Any",   whoA: null   }        // 5
    ];
    RefreshBalances(); // Here so not called before addresses have been set. ok if done in C, A, B, C order?
    LogContractCreationEvents();
    LogSplitEvents();
    LogSplitReceiptEvents();
    LogFallbackReceiptEvents();
  }).catch(function(e) {
    console.error(""+e);
    // SetStatus("Error getting Carol address");
    return;
  });
  // RefreshBalances(); // Not here as this is invoked before the addresses have been set via the promises - in final "then" above.
  //                       It would be better to chain all these promises.
} // end onload

/* Event handlers
  event OnCreation(address OwnerA, uint EthersU, address AliceA, address BobA, address CarolA); // Constructor
  event OnFallbackReceipt(address SenderA, uint WeiSentU); // Received from sender via fallback fn if non-zero
  event OnSplitReceipt(   address SenderA, uint WeiSentU); // Received from sender via a non-zero transaction to split()
  event OnSplit(address SenderA, uint WeiSentU, uint WeiToBobU, uint WeiToCarolU); // Split on send from Alice, half to Bob, other half to Carol
*/

function LogContractCreationEvents() {
  Splitter.deployed().OnCreation()
    .watch(function (error, value) {
      if (error)
        console.error(error);
      else{
        console.log("Constructor: Owner " + value.args.OwnerA + " plus addresses " + value.args.AliceA +
                    ", " + value.args.BobA + ", " + value.args.CarolA + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
        console.log("Or Constructor: " + AddressToWho(value.args.OwnerA) + " plus addresses for " + AddressToWho(value.args.AliceA) +
                    ", " + AddressToWho(value.args.BobA) + ", " + AddressToWho(value.args.CarolA) + " with " + web3.fromWei(value.args.EthersU, "ether") + " ethers sent");
      }
    //this.stopWatching(); djh?? Fix this
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

