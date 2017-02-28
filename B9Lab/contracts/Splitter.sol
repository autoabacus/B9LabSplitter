pragma solidity ^0.4.8;

/* B9Lab Splitter Assignment

2017.02.18 0.0.0
2017.02.20 0.0.1 getOwnerAddress() added
2017.02.21 0.0.2 After Xavier's comments
2017.02.22 0.0.3 Code tidied up after various gas cost tests (details in own style guide), and wip comments removed
                 Events for receipts to contract via fallback fn and split() made distinct
2017.02.27 0.0.4 Changed from push to pull pattern

ToDo
====
• Check whether it is better to 4 separate get*Address() functions as it is now or one with a number (or enum) parameter.

*/
contract Splitter {
  string  constant cVERSION = "0.0.4";
  enum    N_State { Active, Inactive } // Since we have only 2 states, a bool could have been used instead
  N_State private psStateN; // State of the contract
  address private psOwnerA; // Contract owner. Could be Alice, Bob, or Carol but is not required to be. Remember that the Contract address and balance are different from the owner's address and balance
  address private psAliceA; // Alice
  address private psBobA;   // Bob
  address private psCarolA; // Carol
//mapping (address => uint) private psPendingWithdrawalsMU; No. Since only Bob and Carol are involved here using a mapping or even an array of size 2 would be a waste.
  uint    private pSBobPendingWithdrawalU;
  uint    private pSCarolPendingWithdrawalU;

  // constructor
  function Splitter(address vAliceA, address vBobA, address vCarolA) payable {
    psOwnerA = msg.sender;
    if (vAliceA == address(0) || vBobA == address(0) || vCarolA == address(0)) throw;
    if (vBobA   == vAliceA ||    // address for Bob same as address for Alice
        vCarolA == vAliceA ||    // address for Carol same as address for Alice
        vCarolA == vBobA) throw; // address for Carol same as address for Bob
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
  event OnCreation(address OwnerA, uint EthersU, address AliceA, address BobA, address CarolA); // Constructor
  event OnFallbackReceipt(address SenderA, uint WeiSentU); // Received from sender via fallback fn if non-zero
  event OnSplitReceipt(   address SenderA, uint WeiSentU); // Received from sender via a non-zero transaction to split()
  event OnSplit(address SenderA, uint WeiSentU, uint WeiToBobU, uint WeiToCarolU); // Split on send from Alice, half to Bob, other half to Carol
  event OnWithdrawal(address SenderA, uint WeiWithdrawnU);

  // no external functions

  // constant public functions
  function getVersion() constant returns (string VersionS) {
    return cVERSION;
  }

  function getState() constant returns (N_State) {
    return psStateN;
  }

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
    if (msg.value > 0) OnFallbackReceipt(msg.sender, msg.value);
  }

  // Function to perform: whenever Alice sends ether to the contract, half of it goes to Bob and the other half to Carol
  // 2017.02.22 Return removed as the fn either throws or runs or not, but never returned false
  function split() payable isActive() {
    if (msg.value == 0) throw; // No ethers sent. All of sender's gas will be consumed as a result of the throw = a penalty as per Xavier. app.js avoids making calls for zero amount, so this would only happen for sends via other means.
    // Ethers were sent
    if (msg.sender == psAliceA) {
      // Ethers were sent by Alice so split to Bob and Carol
      uint kHalf1U = msg.value/2;
      uint kHalf2U = msg.value - kHalf1U; // Not also msg.value/2 in case of odd numbered wei
      pSBobPendingWithdrawalU   += kHalf1U; // half to Bob
      pSCarolPendingWithdrawalU += kHalf2U; // the other half to Carol
      OnSplit(msg.sender, msg.value, kHalf1U, kHalf2U);
    }else
      // Ethers were sent to split() by other than Alice
      // The assignment does not say what should happen in this case. Could:
      // a. throw
      // b. let them go to the contract, which they will have done anyway, so just need to log this.
      OnSplitReceipt(msg.sender, msg.value);
  }

  // Function to withdraw pending balances held for Bob or Carol
  function withdraw() returns (bool) {
    uint weiToWithdrawU;
    if (msg.sender == psBobA)
      weiToWithdrawU = pSBobPendingWithdrawalU;
    else if (msg.sender == psCarolA)
      weiToWithdrawU = pSCarolPendingWithdrawalU;
    else
      throw; // punish anyone other than Bob or Carol who dares to call this function
    if (weiToWithdrawU > 0) {
      // There is a balance available for withdrawal
      // Zero the pending refund before sending to prevent re-entrancy attacks
      // (msg.sender == psBobA ? pSBobPendingWithdrawalU : pSCarolPendingWithdrawalU) = 0; // Couldn't use this yet. Got "Error: Conditional expression as left value is not supported yet"
      if (msg.sender == psBobA)
        pSBobPendingWithdrawalU = 0;
      else
        pSCarolPendingWithdrawalU = 0;

      if (msg.sender.send(weiToWithdrawU)) {
        OnWithdrawal(msg.sender, weiToWithdrawU);
        return true;
      }
      // the send failed
      if (msg.sender == psBobA)
        pSBobPendingWithdrawalU = weiToWithdrawU;
      else
        pSCarolPendingWithdrawalU = weiToWithdrawU;
    }
    return false; // either there were no wei to withdraw or the send failed
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
