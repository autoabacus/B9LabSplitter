var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("Splitter error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("Splitter error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("Splitter contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of Splitter: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to Splitter.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: Splitter not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "getOwnerAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getVersion",
        "outputs": [
          {
            "name": "VersionS",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getState",
        "outputs": [
          {
            "name": "",
            "type": "uint8"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getAliceAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "killMe",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getCarolAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getBobAddress",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "split",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "vAliceA",
            "type": "address"
          },
          {
            "name": "vBobA",
            "type": "address"
          },
          {
            "name": "vCarolA",
            "type": "address"
          }
        ],
        "payable": true,
        "type": "constructor"
      },
      {
        "payable": true,
        "type": "fallback"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "OwnerA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "EthersU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "AliceA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "BobA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "CarolA",
            "type": "address"
          }
        ],
        "name": "OnCreation",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          }
        ],
        "name": "OnFallbackReceipt",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          }
        ],
        "name": "OnSplitReceipt",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "WeiToBobU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "WeiToCarolU",
            "type": "uint256"
          }
        ],
        "name": "OnSplit",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x60606040526040516060806106338339810160409081528151602083015191909201515b60008054600160a060020a033381166101000261010060a860020a0319909216919091179091558316158061005f5750600160a060020a038216155b806100715750600160a060020a038116155b1561007b57610000565b82600160a060020a031682600160a060020a031614806100ac575082600160a060020a031681600160a060020a0316145b806100c8575081600160a060020a031681600160a060020a0316145b156100d257610000565b60018054600160a060020a03858116600160a060020a03199283168117909355600280548683169084168117909155600380548684169416841790556000805460ff1916905560408051339093168352346020840152828101949094526060820152608081019190915290517f6e91f529020393cb27e7642066141748274cbbcfa6d4632cf46076debb9089c99181900360a00190a15b5050505b6104b78061017c6000396000f300606060405236156100725763ffffffff60e060020a6000350416630c4f65bd81146100c85780630d8e6e2c146100f15780631865c57d1461017e5780633f868b0f146101ac578063b603cd80146101d5578063bf778f52146101f6578063e304b0b41461021f578063f765417614610248575b6100c65b60003411156100c35760408051600160a060020a033316815234602082015281517f39d1569f1d1e846d090c1524d9415565ef53c90542c98a778db4c731df56e7da929181900390910190a15b5b565b005b34610000576100d5610252565b60408051600160a060020a039092168252519081900360200190f35b34610000576100fe610267565b604080516020808252835181830152835191928392908301918501908083838215610144575b80518252602083111561014457601f199092019160209182019101610124565b505050905090810190601f1680156101705780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761018b6102ac565b6040518082600181116100005760ff16815260200191505060405180910390f35b34610000576100d56102b6565b60408051600160a060020a039092168252519081900360200190f35b34610000576101e26102c6565b604080519115158252519081900360200190f35b34610000576100d561031c565b60408051600160a060020a039092168252519081900360200190f35b34610000576100d561032c565b60408051600160a060020a039092168252519081900360200190f35b6100c661033c565b005b6000546101009004600160a060020a03165b90565b604080516020818101835260009091528151808301909252600582527f302e302e33000000000000000000000000000000000000000000000000000000908201525b90565b60005460ff165b90565b600154600160a060020a03165b90565b60008060005460ff166001811161000057146102e157610000565b60005433600160a060020a0390811661010090920416141561031357506000805460ff19166001908117909155610264565b610000565b5b90565b600354600160a060020a03165b90565b600254600160a060020a03165b90565b6000808060005460ff1660018111610000571461035857610000565b34151561036457610000565b60015433600160a060020a039081169116141561044157505060028054604051349283049283900391600160a060020a0316906108fc8415029084906000818181858888f1935050505015156103b957610000565b600354604051600160a060020a039091169082156108fc029083906000818181858888f1935050505015156103ed57610000565b60408051600160a060020a03331681523460208201528082018490526060810183905290517f78264fdc4c93822669767e557e090c87557f5951725e0fac5909d6923fd45c749181900360800190a1610485565b60408051600160a060020a033316815234602082015281517f85386e76988169e9b5a44648ef1df11680573918c0faa069383c03cfdce4d993929181900390910190a15b5b5b50505600a165627a7a72305820b5a9f80c47a49755b23f0fe6441d8188850aa943ce48b6c68cd9bb76fd6cceb00029",
    "events": {
      "0x6e91f529020393cb27e7642066141748274cbbcfa6d4632cf46076debb9089c9": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "OwnerA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "EthersU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "AliceA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "BobA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "CarolA",
            "type": "address"
          }
        ],
        "name": "OnCreation",
        "type": "event"
      },
      "0xfa8bac16361c726fa58d6585227e1605c858d37437032b47837e5357dbb59503": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          }
        ],
        "name": "OnReceipt",
        "type": "event"
      },
      "0x78264fdc4c93822669767e557e090c87557f5951725e0fac5909d6923fd45c74": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "WeiToBobU",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "WeiToCarolU",
            "type": "uint256"
          }
        ],
        "name": "OnSplit",
        "type": "event"
      },
      "0x39d1569f1d1e846d090c1524d9415565ef53c90542c98a778db4c731df56e7da": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          }
        ],
        "name": "OnFallbackReceipt",
        "type": "event"
      },
      "0x85386e76988169e9b5a44648ef1df11680573918c0faa069383c03cfdce4d993": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "SenderA",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "WeiSentU",
            "type": "uint256"
          }
        ],
        "name": "OnSplitReceipt",
        "type": "event"
      }
    },
    "updated_at": 1487795787133,
    "links": {},
    "address": "0xffbd44725094f7d66a1119f82405f7fdddd10c91"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "Splitter";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.Splitter = Contract;
  }
})();
