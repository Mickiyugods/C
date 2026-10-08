// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal slices of the Pons V2 interfaces we depend on. Signatures taken from
///      docs.ponsfamily.com/v2 and checked against the deployed contracts on chain 4663.
interface IPonsFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    function launchFee() external view returns (uint256);

    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);

    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) external view returns (bytes32);
}

interface IPonsCurve {
    function sweepFees(uint256 minBuybackTokensOut) external;
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
    function feeBps() external view returns (uint256);
    function creatorTaxBps() external view returns (uint256);
}

interface IPonsHook {
    function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut) external;
}

interface IFeeEscrow {
    function balanceOf(address recipient) external view returns (uint256);
    function claim() external;
}
