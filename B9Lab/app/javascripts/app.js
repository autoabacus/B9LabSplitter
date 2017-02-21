// 2017.021.21 Extensively revised following Xavier's comments about use of the global WhoA and WhoS plus the previous switch construction for setting who info

var SdepFn; // Splitter.deployed()
var ContractA, OwnerA, AliceA, BobA, CarolA; // Addresses
var Errors;

// Utility fns
function SetStatus(msgS) {
  document.getElementById("Status").innerHTML = msgS;
};

function SetAddress(addrA, whoS) {
  document.getElementById(whoS+"Addr").innerHTML = addrA;
};

function GetWhoObj(whoI) {
  var all = [
    { whoS: "Contract", whoA: ContractA },
    { whoS: "Owner", whoA: OwnerA },
    { whoS: "Alice", whoA: AliceA },
    { whoS: "Bob",   whoA: BobA   },
    { whoS: "Carol", whoA: CarolA },
    { whoS: "Any",   whoA: null   }
  ];
  var whoO = all[whoI];
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
  /*
  try {
    document.getElementById(whoO.whoS + "Ethers").innerHTML = web3.fromWei(web3.eth.getBalance(whoO.whoA), "ether");
  }
  catch(err) {
    Errors++;
    var msgS = "Error getting balance for " + whoO.whoS;
    console.log(msgS);
    console.log(err);
    SetStatus(msgS + " - see log.");
  };
  */
  // 201702.21 Rewritten following Xavier's comment: Prefer using the asynchronous methods to accommodate MetaMask at least
  web3.eth.getBalance(whoO.whoA, function(error, result) {
    if (!error)
      document.getElementById(whoO.whoS + "Ethers").innerHTML = web3.fromWei(result, "ether");
    else {
      Errors++;
      var msgS = "Error getting balance for " + whoO.whoS;
      console.log(msgS);
      console.error(""+error);
      SetStatus(msgS + " - see log.");
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
  var msgS = "Sending " + amtD + " Ethers to Splitter.split() from " + whoO.whoS;
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
  SdepFn = Splitter.deployed();
  // Addresses
  // This method of getting the contract address works but it gives a warning:
  // Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check
  // What function can be used?
  ContractA = Splitter.address;
  SetAddress(ContractA, "Contract");

  SdepFn.getVersion.call().then(function(result) {
    document.getElementById("Version").innerHTML = result;
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Splitter version");
    return;
  });

  SdepFn.getOwnerAddress.call().then(function(result) {
    OwnerA = result;
    SetAddress(OwnerA, "Owner");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Owner address");
    return;
  });

  SdepFn.getAliceAddress.call().then(function(result) {
    AliceA = result;
    SetAddress(AliceA, "Alice");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Alice address");
    return;
  });

  SdepFn.getBobAddress.call().then(function(result) {
    BobA = result;
    SetAddress(BobA, "Bob");
  }).catch(function(e) {
    console.error(""+e);
    SetStatus("Error getting Bob address");
    return;
  });

  SdepFn.getCarolAddress.call().then(function(result) {
    CarolA = result;
    SetAddress(CarolA, "Carol");
    // LoadedB = true;
    RefreshBalances(); // Here so not called before addresses have been set. ok if done in C, A, B, C order?
  }).catch(function(e) {
    console.error(""+e);
    // SetStatus("Error getting Carol address");
    return;
  });

  // RefreshBalances(); // Not here as this is invoked before the addresses have been set via the promises - in final "then" above.
  //                       It would be better to chain all these promises.

}
