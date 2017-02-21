module.exports = function(deployer) {
  //     function Splitter(address vAliceA, address vBobA, address vCarolA) payable
  deployer.deploy(Splitter, web3.eth.accounts[1], web3.eth.accounts[2], web3.eth.accounts[3]);
  // The constructor can throw if the accounts are 0 or duplicates.
  // What to do here in the event of a throw?
};
