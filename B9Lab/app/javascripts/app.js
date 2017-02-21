var SdepFn; // Splitter.deployed()
var ContractA, OwnerA, AliceA, BobA, CarolA; // Addresses
var WhoA, WhoS;
var Errors;

// Utility fns
function SetStatus(msgS) {
  document.getElementById("Status").innerHTML = msgS;
};

function SetAddress(addrA, whoS) {
  document.getElementById(whoS+"Addr").innerHTML = addrA;
};

function SetWho(whoI) {
  switch (whoI) {
    case 0: WhoS = "Contract"; WhoA = ContractA; break;
    case 1: WhoS = "Owner";    WhoA = OwnerA;    break;
    case 2: WhoS = "Alice";    WhoA = AliceA;    break;
    case 3: WhoS = "Bob";      WhoA = BobA;      break;
    case 4: WhoS = "Carol";    WhoA = CarolA;    break;
    case 5: WhoS = "Any";
      var addS = document.getElementById("AnyAddr").value;
      if (!addS.length) {
        SetStatus("Please enter a valid address for 'Anyone'");
        WhoA = null;
      }else
        WhoA = addS; // no checking other than for zero length!
      break;
  }
}

// Requires SetWho() to have been called first to set WhoS and WhoA
function SetBalance() {
  try {
    document.getElementById(WhoS + "Ethers").innerHTML = web3.fromWei(web3.eth.getBalance(WhoA), "ether");
  }
  catch(err) {
    Errors++;
    var msgS = "Error getting balance for " + WhoS;
    console.log(msgS);
    //console.log(err); errors with invalid address for err
    SetStatus(msgS + " - see log.");
  };
}

function RefreshBalances() {
  SetStatus("Refreshing balances...");
  Errors = 0;
  for (var iX=0; iX<=5; iX++) {
    SetWho(iX);
    if (WhoA != null) SetBalance();
  }
  if (!Errors)
    SetStatus("Balances refreshed");
};

// Button click fns
function Refresh() {
  RefreshBalances();
}

function Send(fromNumS) {
  var amtD;
  SetWho(Number(fromNumS));
  if (!WhoA) return; // null in the Any case with no address
  amtD = parseFloat(document.getElementById(WhoS + "Amt").value);
  if (isNaN(amtD)) {
    SetStatus("Please enter a valid positive non-zero 'Ethers to Send' numeric value for " + WhoS + " to send");
    return;
  }
  if (amtD <= 0.0) {
    SetStatus("Please enter a positive non-zero 'Ethers to Send' number to send to " + WhoS);
    return;
  }
  var msgS = "Sending " + amtD + " Ethers to Splitter.split() from " + WhoS;
  SetStatus(msgS + " ... (Hold on while this transaction is added to the blockchain if it is valid.)");
  console.log(msgS);
//SdepFn.split({from: WhoA, value: web3.toWei(amtD, "ether"), gas: 1000000 }).then(function(result) {
  SdepFn.split({from: WhoA, value: web3.toWei(amtD, "ether")}).then(function(result) {
    console.log("Result: " + result);
    SetStatus("Transaction complete!");
    RefreshBalances();
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error " + msgS + " - see log.");
  });
};


// Event fns
window.onload = function() {
  SdepFn = Splitter.deployed();
  // Addresses
  // This method of getting the contract address works but it gives:
  // Synchronous XMLHttpRequest on the main thread is deprecated because of its detrimental effects to the end user's experience. For more help, check
  // What function can be used?
  ContractA = SdepFn.address;
  SetAddress(ContractA, "Contract");

  SdepFn.getVersion.call().then(function(result) {
    document.getElementById("Version").innerHTML = result;
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error getting Splitter version");
    return;
  });

  SdepFn.getOwnerAddress.call().then(function(result) {
    OwnerA = result;
    SetAddress(OwnerA, "Owner");
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error getting Owner address");
    return;
  });

  SdepFn.getAliceAddress.call().then(function(result) {
    AliceA = result;
    SetAddress(AliceA, "Alice");
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error getting Alice address");
    return;
  });

  SdepFn.getBobAddress.call().then(function(result) {
    BobA = result;
    SetAddress(BobA, "Bob");
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error getting Bob address");
    return;
  });

  SdepFn.getCarolAddress.call().then(function(result) {
    CarolA = result;
    SetAddress(CarolA, "Carol");
    // LoadedB = true;
    RefreshBalances(); // Here so not called before addresses have been set. ok if done in C, A, B, C order?
  }).catch(function(e) {
    console.log(e);
    SetStatus("Error getting Carol address");
    return;
  });

  // RefreshBalances(); // Not here as this is invoked before the addresses have been set via the promises - in final "then" above.
  //                       It would be better to chain all these promises.

}
