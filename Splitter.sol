pragma solidity ^0.4.8;

// B9Lab Splitter Assignment

contract Splitter {
  string  constant cVERSION = "0.0.0";
  enum    N_State { Created, Active, Inactive }
  N_State private psStateN; // State of the contract
  address private psOwnerA; // Contract owner. Could be Alice, Bob, or Carol but is not required to be. Remember that the Contract address and balance are different from the owner's address and balance
  address private psAliceA; // Alice
  address private psBobA;   // Bob
  address private psCarolA; // Carol

  // constructor
  function Splitter(address vAliceA, address vBobA, address vCarolA) payable {
    psOwnerA = msg.sender;
    psStateN = N_State.Created;
    address kNullA = address(0);
    if (vAliceA == kNullA) throw; // Add events to log these constructor throws?
    if (vBobA   == kNullA) throw;
    if (vCarolA == kNullA) throw;
    if (vBobA   == vAliceA) throw; // address for Bob same as address for Alice
    if (vCarolA == vAliceA) throw; // address for Carol same as address for Alice
    if (vCarolA == vBobA) throw;   // address for Carol same as address for Bob
    psAliceA = vAliceA;
    psBobA   = vBobA;
    psCarolA = vCarolA;
    psStateN = N_State.Active; // created with all addresses set
    OnCreation(msg.sender, msg.value, vAliceA, vBobA, vCarolA);
  }

  // modifier functions
  modifier isActive () {
    if (psStateN != N_State.Active) throw;
    _;
  }

  // events
  // Note to self: Have yet to decide for my style guide whether to use names in events or not. Have not used them here.
  event OnCreation(address, uint, address, address, address); // sender, value, Alice, Bob, Carol - constructor
  event OnReceipt(address, uint);                             // sender, value - value wei received from sender if non-zero
  event OnSplit(address, uint, uint, uint);                   // sender, value, half to Bob, other half to Carol

  // no external functions

  // constant public functions
  function getVersion() constant returns (string) {
    return cVERSION;
  }

  function getState() constant returns (N_State) { // No isActive modifier for this one
    return psStateN;                               // = any Ethers sent with a call will be lost if the contract has been killed
  }

  function getBalance() constant isActive() returns (uint) {
    return this.balance;
  }

  function getAliceAddress() constant isActive() returns (address) {
    return psAliceA;
  }

  function getBobAddress() constant isActive() returns (address) {
    return psBobA;
  }

  function getCarolAddress() constant isActive() returns (address) {
    return psCarolA;
  }

  // public functions

  // fallback function
  // To be used for assignment "we can send ether to it from the web page"
  function() payable {
    if (msg.value > 0) OnReceipt(msg.sender, msg.value);
  }

  // Function to perform: whenever Alice sends ether to the contract, half of it goes to Bob and the other half to Carol
  function split() payable isActive() returns (bool) {
    if (msg.value == 0) throw; // No ethers sent. Could perhaps instead return false here and let sender pay the gas.
    // Ethers were sent
    if (msg.sender == psAliceA) {
      // Ethers were sent by Alice so split to Bob and Carol
      uint kHalf1U = msg.value/2;
      uint kHalf2U = msg.value - kHalf1U; // Not also msg.value/2 in case of odd numbered wei
      if (!psBobA.send(kHalf1U)) throw;   // send half to Bob but throw if the send() fails
      if (!psCarolA.send(kHalf2U)) throw; // send the other half to Carol but throw if the send() fails. What about the half already sent to Bob??
      OnSplit(msg.sender, msg.value, kHalf1U, kHalf2U);
      return true;
    }
    // Ethers were sent to split() by other than Alice
    // The assignment does not say what should happen in this case. Could:
    // a. throw
    // b. let them go to the contract as for the fallback fn, which for want of a clear spec is what we'll do
    return this.send(msg.value); // Assume this will this run the fallback and get logged there
  }

  // killMe() function re Stretch goals: add a kill switch to the whole contract
  // Do by setting state to Inactive that is then checked on public fn calls as per the FAQ:
  // http://solidity.readthedocs.io/en/latest/frequently-asked-questions.html
  // If you want to deactivate your contracts, it is preferable to disable them by changing some internal state which causes all functions to throw. This will make it impossible to use the contract and ether sent to the contract will be returned automatically.
  // Whereas the alternative of using selfdestruct creates a sink
  // Could easily have a resurrectMe() too by reverting to the state before killMe() sets the state to Inactive
  function killMe() returns (bool) {
    if (msg.sender == psOwnerA) {
    //selfdestruct(psOwnerA); No. Set state to inactive instead to avoid creating a sink
      psStateN = N_State.Inactive; // contract has been killed
      return true;
    }
    return false;
  }

  // no internal functions
  // no private functions

}
