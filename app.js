import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk';

window.__appErrors = window.__appErrors || [];
window.addEventListener('error', (event) => {
  window.__appErrors.push({ type: 'error', message: event.message || '', stack: event.error?.stack || '' });
});
window.addEventListener('unhandledrejection', (event) => {
  window.__appErrors.push({ type: 'unhandledrejection', message: event.reason?.message || String(event.reason || '') });
});

const STORAGE_KEY = 'deploy-on-base.history.v1';
const TEMPLATES = {
  storage: {
    name: 'Simple Storage',
    file: 'SimpleStorage.sol',
    description: 'Basic data storage contract',
    params: ['projectName', 'amount', 'description', 'imageUri'],
  },
  nft: {
    name: 'Simple NFT',
    file: 'SimpleNFT.sol',
    description: 'Minimal NFT contract',
    params: ['name', 'symbol'],
  },
  erc20: {
    name: 'ERC20 Token',
    file: 'ERC20Token.sol',
    description: 'Standard token contract',
    params: ['name', 'symbol', 'initialSupply'],
  },
};

const DEFAULTS = {
  projectName: 'Base Quest Token',
  tokenSymbol: 'BQT',
  amount: '1000000',
  description: 'Deploy a token metadata contract on Base with a simple mobile-first flow.',
  imageUri: 'https://deploy-on-base.vercel.app/assets/og.png',
};

const CHAINS = {
  base: {
    label: 'Base Mainnet',
    chainId: 8453,
    chainIdHex: '0x2105',
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  'base-sepolia': {
    label: 'Base Sepolia',
    chainId: 84532,
    chainIdHex: '0x14a34',
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

const state = {
  provider: null,
  signer: null,
  address: '',
  artifact: null,
  baseSource: '',
  compiledHash: '',
  history: loadHistory(),
  latestAddress: '',
  latestTxHash: '',
  isCompiling: false,
  isDeploying: false,
  isAutoConnecting: false,
  hasAutoConnectAttempted: false,
  boundProvider: null,
};

const els = {
  connectBtn: document.getElementById('connect-btn'),
  networkPill: document.getElementById('network-pill'),
  walletPill: document.getElementById('wallet-pill'),
  connectionState: document.getElementById('connection-state'),
  walletAddress: document.getElementById('wallet-address'),
  walletChain: document.getElementById('wallet-chain'),
  txHash: document.getElementById('tx-hash'),
  contractAddress: document.getElementById('contract-address'),
  compileBtn: document.getElementById('compile-btn'),
  deployBtn: document.getElementById('deploy-btn'),
  deploy5Btn: document.getElementById('deploy-5-btn'),
  copyAddressBtn: document.getElementById('copy-address-btn'),
  openBasescanBtn: document.getElementById('open-basescan-btn'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  fillSampleBtn: document.getElementById('fill-sample-btn'),
  resetBtn: document.getElementById('reset-btn'),
  chainSelect: document.getElementById('chain-select'),
  projectName: document.getElementById('project-name'),
  tokenSymbol: document.getElementById('token-symbol'),
  projectAmount: document.getElementById('project-amount'),
  projectDescription: document.getElementById('project-description'),
  imageUri: document.getElementById('image-uri'),
  sourcePreview: document.getElementById('source-preview'),
  sourceMeta: document.getElementById('source-meta'),
  compileStatus: document.getElementById('compile-status'),
  artifactStatus: document.getElementById('artifact-status'),
  log: document.getElementById('log'),
  historyList: document.getElementById('history-list'),
};

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(0, 25)));
}

function activeChain() {
  return CHAINS[els.chainSelect.value] || CHAINS.base;
}

function shortAddress(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function draftValues() {
  return {
    projectName: els.projectName.value.trim(),
    tokenSymbol: els.tokenSymbol.value.trim().toUpperCase(),
    amount: els.projectAmount.value.trim(),
    description: els.projectDescription.value.trim(),
    imageUri: els.imageUri.value.trim() || DEFAULTS.imageUri,
  };
}

function validateDraft(draft) {
  const errors = [];
  if (!draft.projectName) errors.push('Token name is required.');
  if (!draft.tokenSymbol) errors.push('Token symbol is required.');
  if (!/^[A-Z0-9]{2,10}$/.test(draft.tokenSymbol)) {
    errors.push('Token symbol must be 2-10 uppercase letters or numbers.');
  }
  if (!draft.amount) errors.push('Initial supply is required.');
  if (!Number.isInteger(Number(draft.amount)) || Number(draft.amount) <= 0) {
    errors.push('Initial supply must be an integer greater than 0.');
  }
  if (!draft.description) errors.push('Token description is required.');
  return errors;
}

function generatePreviewSource(draft) {
  const summary = `/*\n  Draft values used for this deploy:\n  - tokenName: ${draft.projectName}\n  - tokenSymbol: ${draft.tokenSymbol}\n  - initialSupply: ${draft.amount}\n  - tokenDescription: ${draft.description}\n  - imageUri: ${draft.imageUri}\n*/`;
  return `${summary}\n\n${state.baseSource}`;
}

function setStatus(el, kind, text) {
  el.classList.remove('good', 'warn');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function log(level, message) {
  const line = document.createElement('div');
  line.className = `log-line ${level}`;
  line.textContent = `[${level}] ${message}`;
  els.log.appendChild(line);
  while (els.log.children.length > 80) els.log.removeChild(els.log.firstElementChild);
  els.log.scrollTop = els.log.scrollHeight;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '🎉',
    error: '✗',
    info: 'ℹ',
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">${escapeHtml(message)}</div>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function toastLog(message) {
  log('info', message);
}

function celebrateSuccess() {
  const burst = document.createElement('div');
  burst.className = 'success-burst';
  burst.setAttribute('aria-hidden', 'true');

  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 24;
    const distance = 90 + (i % 4) * 26;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * -1;
    const rotate = (i % 2 === 0 ? 1 : -1) * (18 + i * 3);
    const scale = 0.8 + (i % 5) * 0.08;
    return `<span class="burst-emoji" style="--tx:${x.toFixed(1)}px;--ty:${y.toFixed(1)}px;--rot:${rotate}deg;--scale:${scale.toFixed(2)};--delay:${i * 22}ms;">${i % 3 === 0 ? '✨' : '🎉'}</span>`;
  }).join('');

  burst.innerHTML = `
    <div class="success-core"></div>
    <div class="success-ring success-ring-a"></div>
    <div class="success-ring success-ring-b"></div>
    <div class="success-chip">🎉 Deployment Successful</div>
    ${particles}
  `;

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 2400);
}

function renderSource() {
  if (!state.baseSource) return;
  const draft = draftValues();
  els.sourcePreview.value = generatePreviewSource(draft);
  state.compiledHash = window.ethers.id(els.sourcePreview.value);
  els.sourceMeta.textContent = `template hash ${shortHash(state.compiledHash)}`;
  setStatus(els.compileStatus, 'good', 'Compile ready ✓');
}

function renderWallet() {
  if (state.address) {
    els.walletPill.textContent = shortAddress(state.address);
    els.walletAddress.textContent = state.address;
    setStatus(els.connectionState, 'good', 'Connected');
    els.connectBtn.textContent = shortAddress(state.address);
  } else {
    els.walletPill.textContent = 'Not connected';
    els.walletAddress.textContent = '—';
    setStatus(els.connectionState, '', 'Disconnected');
    els.connectBtn.textContent = 'Connect Wallet';
  }
  const chain = activeChain();
  els.networkPill.textContent = chain.label;
  els.walletChain.textContent = `${chain.label} (${chain.chainId})`;
}

function bindProviderEvents(provider) {
  if (!provider?.on || state.boundProvider === provider) return;

  provider.on('accountsChanged', async (accounts) => {
    if (!accounts || accounts.length === 0) {
      state.address = '';
      state.signer = null;
      renderWallet();
      return;
    }
    try {
      await connectWallet({ prompt: false, silent: true });
    } catch {}
  });

  state.boundProvider = provider;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTransactionReceipt(txHash, maxAttempts = 120, delayMs = 2000) {
  const ethers = window.ethers;
  const rpcUrl = activeChain().rpcUrls[0];
  const receiptProvider = new ethers.JsonRpcProvider(rpcUrl, activeChain().chainId);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const receipt = await receiptProvider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await sleep(delayMs);
  }

  throw new Error('Timed out while waiting for transaction confirmation.');
}

function renderTransactionState(txHash = '—', contractAddress = '—') {
  els.txHash.textContent = txHash;
  els.contractAddress.textContent = contractAddress;
  state.latestTxHash = txHash === '—' ? '' : txHash;
  state.latestAddress = contractAddress === '—' ? '' : contractAddress;
  
  // Show BaseScan button if contract deployed
  if (state.latestAddress) {
    els.openBasescanBtn.style.display = 'inline-flex';
  } else {
    els.openBasescanBtn.style.display = 'none';
  }
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="empty">No deployments yet. Successful deployments will appear here.</div>';
    return;
  }
  els.historyList.innerHTML = state.history
    .map((item) => {
      const when = new Date(item.createdAt).toLocaleString();
      return `
        <div class="history-item">
          <div class="title">
            <strong>${escapeHtml(item.projectName)} (${escapeHtml(item.tokenSymbol)})</strong>
            <span class="mini">${escapeHtml(item.chainLabel)}</span>
          </div>
          <div class="meta">
            Initial supply: <span class="inline-code">${escapeHtml(item.amount)}</span><br />
            Address: <span class="inline-code">${escapeHtml(shortAddress(item.contractAddress))}</span><br />
            Tx: <span class="inline-code">${escapeHtml(shortHash(item.txHash))}</span><br />
            ${escapeHtml(when)}
          </div>
          <div class="actions">
            <button class="btn small ghost" data-copy-address="${escapeHtml(item.contractAddress)}">Copy</button>
            <button class="btn small ghost" data-open-tx="${escapeHtml(item.txHash)}">Open Tx</button>
            <button class="btn small ghost" data-open-address="${escapeHtml(item.contractAddress)}">Open Address</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function setDeployButtons(disabled) {
  els.deployBtn.disabled = disabled;
  els.deploy5Btn.disabled = disabled;
  els.compileBtn.disabled = disabled;
  els.connectBtn.disabled = disabled && !state.address;
  
  // Toggle loading class
  if (disabled) {
    els.deployBtn.classList.add('loading');
    els.deploy5Btn.classList.add('loading');
  } else {
    els.deployBtn.classList.remove('loading');
    els.deploy5Btn.classList.remove('loading');
  }
}

async function loadArtifacts() {
  const [artifactRes, sourceRes] = await Promise.all([
    fetch('./artifacts/DeployOnBase.json'),
    fetch('./contracts/DeployOnBase.sol'),
  ]);

  if (!artifactRes.ok) throw new Error(`Artifact fetch failed: ${artifactRes.status}`);
  if (!sourceRes.ok) throw new Error(`Source fetch failed: ${sourceRes.status}`);

  state.artifact = await artifactRes.json();
  state.baseSource = await sourceRes.text();
  els.artifactStatus.textContent = `Artifact loaded (${state.artifact.abi.length} ABI entries)`;
  setStatus(els.artifactStatus, 'good', 'Artifact loaded ✓');
  renderSource();
}

async function getProvider() {
  if (sdk?.wallet?.getEthereumProvider) {
    try {
      return await sdk.wallet.getEthereumProvider();
    } catch (error) {
      console.warn('Farcaster provider unavailable, falling back to window.ethereum', error);
    }
  }
  if (window.ethereum?.request) return window.ethereum;
  throw new Error('Wallet provider not found. Open in Farcaster or install MetaMask.');
}

async function switchNetwork(provider, chain) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chain.chainIdHex,
          chainName: chain.label,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        },
      ],
    });
  }
}

async function connectWallet({ prompt = true, silent = false } = {}) {
  const provider = await getProvider();
  const chain = activeChain();

  if (!silent) {
    setStatus(els.connectionState, 'warn', 'Connecting...');
  }
  els.connectBtn.classList.add('loading');
  els.connectBtn.disabled = true;

  try {
    if (prompt) {
      await provider.request({ method: 'eth_requestAccounts' });
    } else {
      const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => []);
      if (!accounts || accounts.length === 0) {
        return false;
      }
    }

    await switchNetwork(provider, chain);
    const ethers = window.ethers;
    const browserProvider = new ethers.BrowserProvider(provider);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();
    state.provider = provider;
    state.signer = signer;
    state.address = address;
    bindProviderEvents(provider);
    renderWallet();
    log('good', `Wallet connected: ${address}`);
    log('info', `Network ready: ${chain.label}`);
    if (!silent) {
      showToast('Wallet connected successfully', 'success');
    }
    return true;
  } catch (error) {
    const msg = error?.shortMessage || error?.message || String(error);
    if (!silent) {
      log('bad', msg);
      setStatus(els.connectionState, 'warn', 'Connection failed');
      showToast(msg, 'error');
    }
    throw error;
  } finally {
    els.connectBtn.classList.remove('loading');
    els.connectBtn.disabled = false;
  }
}

async function autoConnectWallet() {
  if (state.hasAutoConnectAttempted) return false;
  state.hasAutoConnectAttempted = true;
  state.isAutoConnecting = true;

  try {
    const provider = await getProvider();
    const isExtensionProvider = !!window.ethereum?.request && provider === window.ethereum;
    const shouldPrompt = !isExtensionProvider;
    const connected = await connectWallet({ prompt: shouldPrompt, silent: true });
    return Boolean(connected);
  } catch (error) {
    log('info', `Auto-connect skipped: ${error?.message || String(error)}`);
    return false;
  } finally {
    state.isAutoConnecting = false;
    renderWallet();
  }
}

function currentExplorerBase() {
  return activeChain().blockExplorerUrls[0];
}

function openExplorer(path) {
  window.open(`${currentExplorerBase()}${path}`, '_blank', 'noopener,noreferrer');
}

function registerHistory(item) {
  state.history.unshift(item);
  state.history = state.history.slice(0, 25);
  saveHistory();
  renderHistory();
}

async function deployOnce() {
  if (state.isDeploying) return false;
  const draft = draftValues();
  const errors = validateDraft(draft);
  if (errors.length) {
    setStatus(els.compileStatus, 'warn', 'Fix the form errors first');
    errors.forEach((error) => log('bad', error));
    return;
  }
  if (!state.artifact) {
    log('bad', 'Artifact not loaded yet.');
    return;
  }

  state.isDeploying = true;
  setDeployButtons(true);
  try {
    if (!state.address || !state.signer) {
      await connectWallet();
    } else {
      await switchNetwork(state.provider, activeChain());
    }

    if (!state.address || !state.signer) {
      throw new Error('Wallet not connected. Connect your wallet before deploying.');
    }

    const ethers = window.ethers;
    const factory = new ethers.ContractFactory(state.artifact.abi, state.artifact.bytecode, state.signer);
    const amount = ethers.toBigInt(draft.amount);
    const deployTxRequest = await factory.getDeployTransaction(draft.projectName, draft.tokenSymbol, amount, draft.description, draft.imageUri);
    deployTxRequest.gasLimit = activeChain().chainId === 8453 ? 3500000n : 4000000n;

    log('info', `Preparing deploy for token ${draft.projectName} (${draft.tokenSymbol})`);
    setStatus(els.compileStatus, 'good', 'Compiled template ready ✓');

    const tx = await state.signer.sendTransaction(deployTxRequest);
    const expectedAddress = ethers.getCreateAddress({ from: state.address, nonce: tx.nonce });
    renderTransactionState(tx.hash, 'pending...');
    log('info', `Transaction sent: ${tx.hash}`);
    log('info', `Expected contract address: ${expectedAddress}`);
    log('info', 'Waiting for confirmation...');

    const receipt = await waitForTransactionReceipt(tx.hash);
    if (receipt?.status === '0x0') {
      throw new Error('Transaction reverted on-chain.');
    }

    const contractAddress = receipt?.contractAddress || expectedAddress;
    renderTransactionState(tx.hash, contractAddress);
    log('good', `Contract deployed: ${contractAddress}`);
    log('good', `Open on explorer: ${currentExplorerBase()}/address/${contractAddress}`);
    celebrateSuccess();
    showToast(`🎉 ${draft.projectName} (${draft.tokenSymbol}) deployed successfully.`, 'success');

    registerHistory({
      projectName: draft.projectName,
      tokenSymbol: draft.tokenSymbol,
      amount: draft.amount,
      description: draft.description,
      imageUri: draft.imageUri,
      contractAddress,
      txHash: tx.hash,
      chainLabel: activeChain().label,
      createdAt: Date.now(),
    });

    setStatus(els.compileStatus, 'good', 'Deployment successful');
    return true;
  } catch (error) {
    console.error(error);
    const msg = error?.shortMessage || error?.message || String(error);
    log('bad', msg);

    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('wallet not connected') || lowerMsg.includes('wallet provider not found')) {
      setStatus(els.connectionState, 'warn', 'Connection required');
      setStatus(els.compileStatus, 'warn', 'Connect wallet first');
    } else if (lowerMsg.includes('user rejected')) {
      setStatus(els.compileStatus, 'warn', 'Transaction rejected');
    } else if (lowerMsg.includes('missing revert data') || lowerMsg.includes('estimategas')) {
      setStatus(els.compileStatus, 'warn', 'Gas estimation failed');
    } else if (lowerMsg.includes('coalesce')) {
      setStatus(els.compileStatus, 'warn', 'Provider response error');
    } else {
      setStatus(els.compileStatus, 'warn', 'Deployment failed');
    }

    showToast(msg, 'error');
    return false;
  } finally {
    state.isDeploying = false;
    setDeployButtons(false);
    renderWallet();
  }
}

async function deployMany(times) {
  if (state.isDeploying) return;
  const draft = draftValues();
  const errors = validateDraft(draft);
  if (errors.length) {
    setStatus(els.compileStatus, 'warn', 'Fix the form errors first');
    errors.forEach((error) => log('bad', error));
    showToast('Fix the form errors first.', 'error');
    return;
  }
  log('warn', `Batch mode: deploying ${times} contracts sequentially.`);
  showToast(`Starting batch deploy: ${times} contracts`, 'info');
  
  let successCount = 0;
  for (let i = 0; i < times; i += 1) {
    log('info', `Batch deploy ${i + 1}/${times}`);
    // eslint-disable-next-line no-await-in-loop
    const ok = await deployOnce();
    if (ok) {
      successCount += 1;
    } else {
      showToast(`Batch stopped at ${i + 1}/${times}. ${successCount} succeeded.`, 'error');
      break;
    }
  }
  
  if (successCount === times) {
    showToast(`Batch complete! ${successCount}/${times} contracts deployed.`, 'success');
  }
}

async function compileTemplate() {
  if (!state.baseSource) {
    log('warn', 'Source not loaded yet.');
    showToast('Source not loaded yet', 'error');
    return;
  }
  const draft = draftValues();
  const errors = validateDraft(draft);
  if (errors.length) {
    setStatus(els.compileStatus, 'warn', 'Fix the form errors first');
    errors.forEach((error) => log('bad', error));
    showToast('Fix the form errors first.', 'error');
    return;
  }
  state.isCompiling = true;
  els.compileBtn.classList.add('loading');
  els.compileBtn.disabled = true;
  setStatus(els.compileStatus, 'warn', 'Compiling template...');
  renderSource();
  log('good', `Template compiled locally: ${shortHash(state.compiledHash)}`);
  showToast('Template compiled successfully', 'success');
  setTimeout(() => {
    if (!state.isDeploying) setStatus(els.compileStatus, 'good', 'Compile ready ✓');
    state.isCompiling = false;
    els.compileBtn.classList.remove('loading');
    els.compileBtn.disabled = false;
  }, 250);
}

function fillSample() {
  els.projectName.value = 'Gyoo Token';
  els.tokenSymbol.value = 'GYOO';
  els.projectAmount.value = '1000000';
  els.projectDescription.value = 'Community token deployed on Base with a clean, mobile-first flow.';
  els.imageUri.value = DEFAULTS.imageUri;
  renderSource();
}

function resetForm() {
  els.projectName.value = DEFAULTS.projectName;
  els.tokenSymbol.value = DEFAULTS.tokenSymbol;
  els.projectAmount.value = DEFAULTS.amount;
  els.projectDescription.value = DEFAULTS.description;
  els.imageUri.value = '';
  renderSource();
}

async function copyLatestAddress() {
  if (!state.latestAddress) {
    log('warn', 'No contract address yet.');
    showToast('No contract address yet', 'error');
    return;
  }
  await navigator.clipboard.writeText(state.latestAddress);
  log('good', `Copied: ${state.latestAddress}`);
  showToast('Contract address copied', 'success');
}

function wireHistoryActions() {
  els.historyList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const copyAddress = target.getAttribute('data-copy-address');
    const openTx = target.getAttribute('data-open-tx');
    const openAddress = target.getAttribute('data-open-address');

    if (copyAddress) {
      await navigator.clipboard.writeText(copyAddress);
      log('good', `Copied historical address: ${copyAddress}`);
      showToast('Contract address copied.', 'success');
    }
    if (openTx) openExplorer(`/tx/${openTx}`);
    if (openAddress) openExplorer(`/address/${openAddress}`);
  });
}

async function init() {
  try {
    await sdk.actions.ready();
  } catch (error) {
    console.warn('sdk.actions.ready() failed (fine outside Farcaster):', error);
  }

  renderWallet();
  renderHistory();
  wireHistoryActions();

  try {
    await loadArtifacts();
  } catch (error) {
    console.error(error);
    log('bad', `Failed to load template or artifact: ${error.message}`);
    setStatus(els.artifactStatus, 'warn', 'Artifact failed to load');
  }

  els.chainSelect.addEventListener('change', () => {
    renderWallet();
    renderSource();
    log('info', `Switched target chain to ${activeChain().label}`);
  });

  [els.projectName, els.tokenSymbol, els.projectAmount, els.projectDescription, els.imageUri].forEach((input) => {
    input.addEventListener('input', () => {
      renderSource();
    });
  });

  els.connectBtn.addEventListener('click', async () => {
    try {
      await connectWallet();
    } catch (error) {
      log('bad', error?.message || String(error));
      setStatus(els.connectionState, 'warn', 'Connection failed');
    }
  });

  els.compileBtn.addEventListener('click', async () => {
    try {
      await compileTemplate();
    } catch (error) {
      log('bad', error?.message || String(error));
    }
  });

  els.deployBtn.addEventListener('click', async () => {
    await deployOnce();
  });

  els.deploy5Btn.addEventListener('click', async () => {
    await deployMany(5);
  });

  els.copyAddressBtn.addEventListener('click', async () => {
    try {
      await copyLatestAddress();
    } catch (error) {
      log('bad', error?.message || String(error));
    }
  });

  els.openBasescanBtn.addEventListener('click', () => {
    if (!state.latestAddress) return;
    openExplorer(`/address/${state.latestAddress}`);
  });

  els.clearHistoryBtn.addEventListener('click', () => {
    state.history = [];
    saveHistory();
    renderHistory();
    log('warn', 'History cleared.');
  });

  els.fillSampleBtn.addEventListener('click', fillSample);
  els.resetBtn.addEventListener('click', resetForm);

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
      event.preventDefault();
      deployOnce();
    }
  });

  renderSource();
  if (!state.history.length) renderHistory();

  try {
    await autoConnectWallet();
  } catch {}
}

void init();

