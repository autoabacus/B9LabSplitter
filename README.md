# B9LabSplitter
B9Lab Course Splitter Project

This "0.0.1" version is push based. Pull version possibly coming.

It is also waiting on a response from Xavier re:

@arek   has pointed out that my Solidity.sol code does not split Ethers sent "to the contract" by Alice as per the spec, only those sent by Alice to Splitter.split(). (Nor do other Splitters that I have looked at do so apart from Arek's.)

To intercept ethers sent by Alice "to the contract", rather than to split(), requires this to be detected in the fallback function, and then for the split operation to be performed. But how can this be done while staying within the 2300 gas stipend for the fallback function, as that does not provide enough gas for storage or send operations?

And how come Arek's SimpleSplitter works since it does two sends via the fallback function by calling his private split() function? (It had gas problems when events were included, but without the events Arek reports that it runs, though the code violates what the docs say can be run via a fallback function.)
---

The "funny" variable names are because of my trial version of Hungarian for Solidity described in Solidity Style Guide.txt.
