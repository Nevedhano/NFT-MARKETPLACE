import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Bonanza_abi } from './NFT_abi'; // Ensure correct ABI import
import './NFTImageFetcher.css';
import axios from 'axios';

const nftContractAddress = '0x0Dbb407783637596160f8AdEC2E43FbEccd4d39C'; // Replace with your NFT contract address

const pinataApiKey = 'd412d28403144441fa5a'; // Replace with your Pinata API key
const pinataSecretApiKey = '69836f8f0767011e1d8375728effcbfe055ae19f844042c591f56b0da5ca72dd';

const NFTImageFetcher = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [signerAddress, setSignerAddress] = useState(null);
    const [signer, setSigner] = useState(null);
    const [nftContract, setNftContract] = useState(null);
    const [tokenURI, setTokenURI] = useState('');
    const [price, setPrice] = useState('');
    const [mintedNFTs, setMintedNFTs] = useState([]);
    const [userNFTs, setUserNFTs] = useState([]);
    const [userBoughtNFTs, setUserBoughtNFTs] = useState([]);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('mint'); // 'mint', 'myNFTs', 'mintedNFTs'
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        const storedMintedNFTs = localStorage.getItem('mintedNFTs');
        if (storedMintedNFTs) {
            setMintedNFTs(JSON.parse(storedMintedNFTs));
        }

        const storedUserNFTs = localStorage.getItem('userNFTs');
        if (storedUserNFTs) {
            setUserNFTs(JSON.parse(storedUserNFTs));
        }
    }, []);

    useEffect(() => {
        const filteredUserNFTs = userNFTs.filter(nft => nft.owner === signerAddress);
        setUserBoughtNFTs(filteredUserNFTs);
    }, [userNFTs, signerAddress]);

    // Add event listener for account changes
    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountChange);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener('accountsChanged', handleAccountChange);
            }
        };
    }, [signerAddress]);

    const handleAccountChange = async (accounts) => {
        if (accounts.length > 0) {
            const newSignerAddress = accounts[0];
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const contract = new ethers.Contract(nftContractAddress, Bonanza_abi, signer);
            setSigner(signer);
            setNftContract(contract);
            setSignerAddress(newSignerAddress);
            setIsConnected(true);
        } else {
            setIsConnected(false);
            setSignerAddress(null);
            setSigner(null);
            setNftContract(null);
        }
    };

    const connectToMetaMask = async () => {
        if (window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                const provider = new ethers.providers.Web3Provider(window.ethereum);
                const signer = provider.getSigner();
                setSigner(signer);
                const contract = new ethers.Contract(nftContractAddress, Bonanza_abi, signer);
                setNftContract(contract);
                const address = await signer.getAddress();
                setSignerAddress(address);
                setIsConnected(true);
            } catch (error) {
                console.error('Error connecting to Ethereum provider:', error);
                setError('Error connecting to Ethereum provider. Please check your MetaMask and refresh the page.');
            }
        } else {
            setError('MetaMask is not installed');
        }
    };

    const uploadToIPFS = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const metadata = JSON.stringify({
            name: file.name,
            keyvalues: {
                exampleKey: 'exampleValue'
            }
        });

        formData.append('pinataMetadata', metadata);

        const options = JSON.stringify({
            cidVersion: 0,
        });

        formData.append('pinataOptions', options);

        try {
            const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
                maxContentLength: 'Infinity',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                    'pinata_api_key': pinataApiKey,
                    'pinata_secret_api_key': pinataSecretApiKey
                }
            });
            return res.data.IpfsHash;
        } catch (error) {
            console.error('Error uploading file to IPFS:', error);
            setError('Error uploading file to IPFS');
            return null;
        }
    };

    const createMetadata = async (imageHash) => {
        const metadata = {
            name: 'NFT Name',
            description: 'NFT Description',
            image: `ipfs://${imageHash}`,
        };

        try {
            const res = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
                headers: {
                    'Content-Type': 'application/json',
                    'pinata_api_key': pinataApiKey,
                    'pinata_secret_api_key': pinataSecretApiKey
                }
            });
            return `ipfs://${res.data.IpfsHash}`;
        } catch (error) {
            console.error('Error uploading metadata to IPFS:', error);
            setError('Error uploading metadata to IPFS');
            return null;
        }
    };

    const mintNFT = async (price) => {
        if (!selectedFile) {
            setError('Please select a file to upload');
            return;
        }

        try {
            const imageHash = await uploadToIPFS(selectedFile);
            if (!imageHash) {
                return;
            }

            const tokenURI = await createMetadata(imageHash);
            if (!tokenURI) {
                return;
            }

            if (!nftContract) {
                setError('NFT contract not initialized.');
                return;
            }

            const transaction = await nftContract.safeMint(tokenURI);
            const receipt = await transaction.wait();
            console.log('Token minted successfully!');

            // Get the token ID of the minted NFT from the transaction receipt
            const event = receipt.events.find(event => event.event === 'Transfer');
            const tokenId = event.args[2].toString();

            await fetchNFTMetadata(tokenURI, price, tokenId);

            // Update userNFTs state
            const newNFT = { id: tokenId, tokenURI, imageUri: `https://gateway.pinata.cloud/ipfs/${imageHash}`, price, owner: signerAddress };
            const updatedUserNFTs = [...userNFTs, newNFT];
            setUserNFTs(updatedUserNFTs);
            localStorage.setItem('userNFTs', JSON.stringify(updatedUserNFTs));

            setError('');
        } catch (error) {
            console.error('Error minting token:', error);
            setError(`Error minting token`);
        }
    };

    const fetchNFTMetadata = async (tokenURI, price, tokenId) => {
        try {
            if (!nftContract) {
                setError('NFT contract not initialized.');
                return;
            }

            console.log('Fetching metadata for tokenURI:', tokenURI);

            let tokenURIGateway = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            
            const response = await fetch(tokenURIGateway);
            if (!response.ok) {
                throw new Error(`Failed to fetch metadata from IPFS for Token URI ${tokenURI}`);
            }

            const metadata = await response.json();
            const imageUri = metadata.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');

            const newNFT = { id: tokenId, tokenURI, imageUri, price, owner: signerAddress };
            const updatedMintedNFTs = [...mintedNFTs, newNFT];
            setMintedNFTs(updatedMintedNFTs);
            localStorage.setItem('mintedNFTs', JSON.stringify(updatedMintedNFTs));

            setError('');
        } catch (error) {
            console.error('Error fetching NFT metadata:', error);
            setError(`Error fetching NFT metadata`);
        }
    };
    const buyNFT = async (tokenId, ownerAddress, nftPrice) => {
        try {
            if (!signer || !nftContract) {
                setError('Signer or NFT contract not initialized.');
                return;
            }
    
            if (ownerAddress.toLowerCase() === signerAddress.toLowerCase()) {
                window.alert('You cannot buy your own NFT.');
                return;
            }
    
            if (!nftPrice || isNaN(nftPrice) || Number(nftPrice) <= 0) {
                setError('Invalid price value.');
                return;
            }
    
            const confirmed = window.confirm(`Are you sure you want to buy this NFT from ${ownerAddress}?`);
            if (!confirmed) {
                return;
            }
    
            // Send transaction to buy the NFT
            const tx = await signer.sendTransaction({
                to: ownerAddress,
                value: ethers.utils.parseEther(nftPrice),
            });
    
            await tx.wait();
            console.log(`Purchased NFT ${tokenId} from ${ownerAddress}`);
    
            // Remove the purchased NFT from mintedNFTs based on tokenId
            const updatedMintedNFTs = mintedNFTs.filter(nft => nft.id !== tokenId);
            setMintedNFTs(updatedMintedNFTs);
            localStorage.setItem('mintedNFTs', JSON.stringify(updatedMintedNFTs));
    
            // Remove the purchased NFT from the original owner's userNFTs
            const updatedUserNFTs = userNFTs.filter(nft => !(nft.id === tokenId && nft.owner === ownerAddress));
    
            // Add the NFT to the buyer's userNFTs
            const boughtNFT = mintedNFTs.find(nft => nft.id === tokenId);
            if (boughtNFT) {
                const newUserNFT = { ...boughtNFT, owner: signerAddress };
                const finalUserNFTs = [...updatedUserNFTs, newUserNFT];
                setUserNFTs(finalUserNFTs);
                localStorage.setItem('userNFTs', JSON.stringify(finalUserNFTs));
            }
    
            setError('');
        } catch (error) {
            console.error('Error purchasing NFT:', error);
            setError(`Error purchasing NFT`);
        }
    };
    
    
    const toggleTab = (tab) => {
        setActiveTab(tab);
    };

    return (
        <div className="container">
            <div className="header">
                <div className="top-section">
                    <h1>PICARTS</h1>
                    <div className="connect-button-container">
                        {!isConnected ? (
                            <button onClick={connectToMetaMask} className="connect-button">Connect to MetaMask</button>
                        ) : (
                            <p>Connected as {signerAddress}</p>
                        )}
                    </div>
                </div>
                <div className="tabs">
                    <button
                        className={activeTab === 'mint' ? 'active-tab' : ''}
                        onClick={() => toggleTab('mint')}
                    >
                        Mint
                    </button>
                    <button
                        className={activeTab === 'mintedNFTs' ? 'active-tab' : ''}
                        onClick={() => toggleTab('mintedNFTs')}
                    >
                        NFT MARKETPLACE
                    </button>
                    <button
                        className={activeTab === 'myNFTs' ? 'active-tab' : ''}
                        onClick={() => toggleTab('myNFTs')}
                    >
                        My NFTs
                    </button>
                </div>
            </div>

            <div className="content">
                {activeTab === 'mint' && (
                    <div className="mint-section">
                    <h2>Mint NFT</h2>
                    <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} />
                    <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Enter Price in Ether"
                    />
                    <button onClick={() => mintNFT(price)} className="mint-button">Mint</button>
                    {error && <p style={{ color: 'red' }}>{error}</p>}
                </div>
                
                )}

                {activeTab === 'myNFTs' && (
                    <div className="user-nfts">
                        {userBoughtNFTs.length > 0 ? (
                            userBoughtNFTs.map((nft, index) => (
                                <div key={index} className="user-nft">
                                    <img src={nft.imageUri} alt={`Token ${nft.id}`} />
                                    <p>Owner: {nft.owner}</p>
                                    <p>Price: {nft.price} ETH</p>
                                </div>
                            ))
                        ) : (
                            <p>You don't own any NFTs yet.</p>
                        )}
                    </div>
                )}

                {activeTab === 'mintedNFTs' && (
                    <div className="minted-nfts">
                        {mintedNFTs.length > 0 ? (
                            mintedNFTs.map((nft, index) => (
                                <div key={index} className="minted-nft">
                                    <img src={nft.imageUri} alt={`Token ${nft.id}`} />
                                    <p>Owner: {nft.owner}</p>
                                    <p>Price: {nft.price} ETH</p>
                                    <button onClick={() => buyNFT(nft.id, nft.owner, nft.price)} className="buy-button">Buy</button>
                                </div>
                            ))
                        ) : (
                            <p>No minted NFTs available.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NFTImageFetcher;
