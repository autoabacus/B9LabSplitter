pragma solidity ^0.4.8;

/* B9Lab Splitter Assignment

2017.02.18 0.0.0
2017.02.21 0.0.1 getOwnerAddress() added
2017.02.22 0.0.2 After Xavier's comments

ToDo
====
• As per danielitti check whether
  if (vAliceA == kNullA) throw;
  if (vBobA   == kNullA) throw;
  if (vCarolA == kNullA) throw;```
  or
  if (vAliceA == kNullA OR vBobA == kNullA OR vCarolA == kNullA) throw;
  are different re gas usage and if so which is better.

• Resolve Allice send to contract issue re fallback fn raised by Arek

• Check whether it is better to 4 separate get*Address() functions as it is now or one with a number (or enum) parameter.

*/
contract Splitter {
  string  constant cVERSION = "0.0.2";
  enum    N_State { Active, Inactive } // Created removed as never used
  N_State private psStateN; // State of the contract
  address private psOwnerA; // Contract owner. Could be Alice, Bob, or Carol but is not required to be. Remember that the Contract address and balance are different from the owner's address and balance
  address private psAliceA; // Alice
  address private psBobA;   // Bob
  address private psCarolA; // Carol

  // constructor
  function Splitter(address vAliceA, address vBobA, address vCarolA) payable {
    psOwnerA = msg.sender;
  //psStateN = N_State.Created; Is negative re gas cost and serves no purpose as if a throw happens the contract does not get deployed at all.
  //address kNullA = address(0); Use replaced by comparisons vs address(0) on Xavier's advice
    if (vAliceA == address(0)) throw; // Cannot log these throws via an event as events are rolled back by a throw as advised by Xavier
    if (vBobA   == address(0)) throw;
    if (vCarolA == address(0)) throw;
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
  // 2017.02.21: Changed to using names in events re comment from Xavier: The names you put here carry over to the ABI and help us all in figuring what exactly they represent. When you get the event in Javascript, it would be like myEvent.args.carol.
  event OnCreation(address OwnerA, uint EthersU, address AliceA, address BobA, address CarolA); // Constructor
  event OnReceipt(address SenderA, uint WeiSentU); // Received from sender if non-zero
  event OnSplit(address SenderA, uint WeiSentU, uint WeiToBobU, uint WeiToCarolU); // Split on send from Alice, half to Bob, other half to Carol

  // no external functions

  // constant public functions
  function getVersion() constant returns (string VersionS) {
    return cVERSION;
  }

  function getState() constant returns (N_State) { // No isActive modifier for this one
    return psStateN;                               // = any Ethers sent with a call will be lost if the contract has been killed
  }

  // 2017.02.21 Removed. Not needed as per Xavier as the contract balance is available via web3.eth.getBalance(Splitter.address)
  // function getBalance() constant returns (uint) {
  //   return this.balance;
  // }

  // 2017.02.22 Modifier removed from all constant public functions on Xavier's advice: With a recent Solidity compiler, sending Ether to a constant function will throw.
  function getOwnerAddress() constant returns (address) {
    return psOwnerA;
  }

  function getAliceAddress() constant returns (address) {
    return psAliceA;
  }

  function getBobAddress() constant returns (address) {
    return psBobA;
  }

  function getCarolAddress() constant returns (address) {
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
    if (msg.value == 0) throw; // No ethers sent. All of sender's gas will be consumed as a result of the throw = a penalty as per Xavier. app.js avoids making calls for zero amount, so this would only happen for sends via other means.
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
    // return this.send(msg.value);   // Assume this will this run the fallback and get logged there. Xavier's comment: This looks like an external call to itself, which is more expensive.
    OnReceipt(msg.sender, msg.value); // /- 2017.02.21 Instead of the above re Xavier's comment
    return true;                      // |  Don't actually need to do anything to "send" msg.value to the contract as that happens anyway
  }


  // killMe() function re Stretch goals: add a kill switch to the whole contract
  // Do by setting state to Inactive that is then checked on public fn calls as per the FAQ:
  // http://solidity.readthedocs.io/en/latest/frequently-asked-questions.html
  // If you want to deactivate your contracts, it is preferable to disable them by changing some internal state which causes all functions to throw. This will make it impossible to use the contract and ether sent to the contract will be returned automatically.
  // Whereas the alternative of using selfdestruct creates a sink
  // Could easily have a resurrectMe() too by reverting to the state before killMe() sets the state to Inactive
  function killMe() isActive() returns (bool) {
    if (msg.sender == psOwnerA) {
    //selfdestruct(psOwnerA); No. Set state to inactive instead to avoid creating a sink
      psStateN = N_State.Inactive; // contract has been killed
      return true;
    }
    // return false; 2017.02.21 Changed to throw re Xavier's comment: Here for instance, you could punish with throw the non-owner who dared calling this function.
    throw;
  }

  // no internal functions
  // no private functions

}
