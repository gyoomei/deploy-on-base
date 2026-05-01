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
  erc20: {
    name: 'ERC20 Token',
    file: 'ERC20Token.sol',
    description: 'Standard token contract',
    params: ['name', 'symbol', 'initialSupply'],
  },
};

const DEFAULTS = {
  tokenName: 'Base Token',
  tokenSymbol: 'BASE',
  initialSupply: '1000000',
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
  currentTemplate: 'erc20',
  farcasterUser: null, // { fid, username, displayName, pfpUrl }
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
  shareDeployBtn: document.getElementById('share-deploy-btn'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  fillSampleBtn: document.getElementById('fill-sample-btn'),
  resetBtn: document.getElementById('reset-btn'),
  chainSelect: document.getElementById('chain-select'),
  templateSelect: document.getElementById('template-select'),
  tokenName: document.getElementById('token-name'),
  tokenSymbol: document.getElementById('token-symbol'),
  initialSupply: document.getElementById('initial-supply'),
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
    tokenName: els.tokenName.value.trim(),
    tokenSymbol: els.tokenSymbol.value.trim(),
    initialSupply: els.initialSupply.value.trim(),
  };
}

function validateDraft(draft) {
  const errors = [];
  if (!draft.tokenName) errors.push('Token name wajib diisi.');
  if (!draft.tokenSymbol) errors.push('Token symbol wajib diisi.');
  if (!draft.initialSupply) errors.push('Initial supply wajib diisi.');
  if (!Number.isInteger(Number(draft.initialSupply)) || Number(draft.initialSupply) <= 0) {
    errors.push('Initial supply harus angka bulat lebih dari 0.');
  }
  return errors;
}

function generatePreviewSource(draft) {
  const summary = `/*
  Draft values used for this deploy:
  - tokenName: ${draft.tokenName}
  - tokenSymbol: ${draft.tokenSymbol}
  - initialSupply: ${draft.initialSupply}
*/`;
  return `${summary}

${state.baseSource}`;
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
    success: '✓',
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

function renderSource() {
  if (!state.baseSource) return;
  const draft = draftValues();
  els.sourcePreview.value = generatePreviewSource(draft);
  state.compiledHash = window.ethers.id(els.sourcePreview.value);
  els.sourceMeta.textContent = `template hash ${shortHash(state.compiledHash)}`;
  setStatus(els.compileStatus, 'good', 'Template ready ✓');
}

function renderWallet() {
  if (state.address) {
    els.walletPill.textContent = shortAddress(state.address);
    els.walletAddress.textContent = state.address;
    els.connectionState.textContent = 'Connected';
    els.connectionState.classList.add('good');
    els.connectBtn.textContent = 'Connected';
  } else {
    els.walletPill.textContent = 'Not connected';
    els.walletAddress.textContent = '—';
    els.connectionState.textContent = 'Disconnected';
    els.connectionState.classList.remove('good');
    els.connectBtn.textContent = 'Connect Wallet';
  }
  const chain = activeChain();
  els.networkPill.textContent = chain.label;
  els.walletChain.textContent = `${chain.label} (${chain.chainId})`;
}

function renderTransactionState(txHash = '—', contractAddress = '—') {
  els.txHash.textContent = txHash;
  els.contractAddress.textContent = contractAddress;
  state.latestTxHash = txHash === '—' ? '' : txHash;
  state.latestAddress = contractAddress === '—' ? '' : contractAddress;

  const hasDeployResult = Boolean(state.latestAddress && state.latestTxHash);

  // Show actions only after successful deploy
  if (hasDeployResult) {
    els.openBasescanBtn.style.display = 'inline-flex';
    els.shareDeployBtn.style.display = 'inline-flex';
  } else {
    els.openBasescanBtn.style.display = 'none';
    els.shareDeployBtn.style.display = 'none';
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
            <strong>${escapeHtml(item.tokenName)}</strong>
            <span class="mini">${escapeHtml(item.chainLabel)}</span>
          </div>
          <div class="meta">
            Supply: <span class="inline-code">${escapeHtml(item.initialSupply)}</span><br />
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
    fetch('./artifacts/ERC20Token.json'),
    fetch('./contracts/ERC20Token.sol'),
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

async function connectWallet() {
  const provider = await getProvider();
  const chain = activeChain();
  setStatus(els.connectionState, 'warn', 'Connecting...');
  els.connectBtn.classList.add('loading');
  els.connectBtn.disabled = true;
  
  try {
    await switchNetwork(provider, chain);
    const ethers = window.ethers;
    const browserProvider = new ethers.BrowserProvider(provider);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();
    state.provider = provider;
    state.signer = signer;
    state.address = address;
    renderWallet();
    log('good', `Wallet connected: ${address}`);
    log('info', `Network ready: ${chain.label}`);
    showToast('Wallet connected successfully', 'success');
  } finally {
    els.connectBtn.classList.remove('loading');
    els.connectBtn.disabled = false;
  }
}

async function autoConnectWallet() {
  if (state.address || state.isAutoConnecting) return;
  state.isAutoConnecting = true;
  try {
    await connectWallet();
  } catch (error) {
    console.warn('Auto-connect skipped:', error);
  } finally {
    state.isAutoConnecting = false;
  }
}

function currentExplorerBase() {
  return activeChain().blockExplorerUrls[0];
}

function openExplorer(path) {
  window.open(`${currentExplorerBase()}${path}`, '_blank', 'noopener,noreferrer');
}

async function shareLatestDeploy() {
  if (!state.latestAddress || !state.latestTxHash) {
    showToast('Deploy contract dulu sebelum share', 'error');
    return;
  }

  const appUrl = `${window.location.origin}${window.location.pathname}`;
  const draft = draftValues();
  const tokenName = draft.tokenName || 'My Token';
  const tokenSymbol = draft.tokenSymbol || 'TOKEN';
  const text = [
    `I just deployed ${tokenName} (${tokenSymbol}) on Base 🚀`,
    '',
    'Deploy yours here 👇',
  ].join('\n');

  // Primary: native Farcaster share
  try {
    await sdk.actions.composeCast({
      text,
      embeds: [appUrl],
    });
    log('good', 'Opened Farcaster share composer.');
    showToast('Share composer opened', 'success');
    return;
  } catch (error) {
    console.warn('composeCast failed, using fallback', error);
  }

  // Fallback for non-Farcaster browsers
  const fallbackText = `${text}\n${appUrl}`;
  try {
    await navigator.clipboard.writeText(fallbackText);
  } catch {
    // ignore clipboard failures
  }
  const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(fallbackText)}`;
  window.open(warpcastUrl, '_blank', 'noopener,noreferrer');
  log('warn', 'composeCast unavailable. Opened Warpcast web composer fallback.');
  showToast('Opened web share fallback', 'info');
}

async function waitForReceipt(provider, txHash, timeoutMs = 180000, intervalMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for tx receipt: ${txHash}`);
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
    setStatus(els.compileStatus, 'warn', 'Please fix the form errors first');
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

    const ethers = window.ethers;
    const factory = new ethers.ContractFactory(state.artifact.abi, state.artifact.bytecode, state.signer);
    const initialSupply = ethers.toBigInt(draft.initialSupply);

    log('info', `Preparing deployment for ${draft.tokenName}`);
    setStatus(els.compileStatus, 'good', 'Template ready ✓');

    const deployTx = await factory.getDeployTransaction(draft.tokenName, draft.tokenSymbol, initialSupply);
    deployTx.gasLimit = 3500000n;
    const tx = await state.signer.sendTransaction(deployTx);
    renderTransactionState(tx.hash, 'pending...');
    log('info', `Transaction sent: ${tx.hash}`);
    log('info', 'Waiting for confirmation via public RPC...');

    const rpc = new ethers.JsonRpcProvider(activeChain().rpcUrls[0], activeChain().chainId);
    let receipt = null;
    try {
      receipt = await waitForReceipt(rpc, tx.hash, 120000, 2500);
    } catch (pollError) {
      console.warn('Public RPC receipt polling failed, falling back to tx.wait()', pollError);
      receipt = await tx.wait();
    }
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed or reverted: ${tx.hash}`);
    }
    const contractAddress = receipt.contractAddress || ethers.getCreateAddress({ from: state.address, nonce: tx.nonce });
    renderTransactionState(tx.hash, contractAddress);
    log('good', `Contract deployed: ${contractAddress}`);
    log('good', `Open on explorer: ${currentExplorerBase()}/address/${contractAddress}`);
    showToast(`Contract deployed: ${shortAddress(contractAddress)}`, 'success');

    registerHistory({
      tokenName: draft.tokenName,
      tokenSymbol: draft.tokenSymbol,
      initialSupply: draft.initialSupply,
      contractAddress,
      txHash: tx.hash,
      chainLabel: activeChain().label,
      createdAt: Date.now(),
    });

    setStatus(els.compileStatus, 'good', 'Deployment complete ✓');
    
    return true;
  } catch (error) {
    console.error(error);
    const msg = error?.shortMessage || error?.message || error?.cause?.message || error?.reason?.message || String(error);
    log('bad', msg);
    setStatus(els.compileStatus, 'warn', 'Deployment failed');
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
    setStatus(els.compileStatus, 'warn', 'Please fix the form errors first');
    errors.forEach((error) => log('bad', error));
    showToast('Please fix the form errors first', 'error');
    return;
  }
  log('warn', `Batch mode: deploying ${times} contracts sequentially.`);
  showToast(`Starting batch deployment: ${times} contracts`, 'info');
  
  let successCount = 0;
  for (let i = 0; i < times; i += 1) {
    log('info', `Batch deployment ${i + 1}/${times}`);
    // eslint-disable-next-line no-await-in-loop
    const ok = await deployOnce();
    if (ok) {
      successCount += 1;
    } else {
      showToast(`Batch deployment stopped at ${i + 1}/${times}. ${successCount} succeeded.`, 'error');
      break;
    }
  }
  
  if (successCount === times) {
    showToast(`Batch deployment complete! ${successCount}/${times} contracts deployed.`, 'success');
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
    setStatus(els.compileStatus, 'warn', 'Please fix the form errors first');
    errors.forEach((error) => log('bad', error));
    showToast('Please fix the form errors first', 'error');
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
    if (!state.isDeploying) setStatus(els.compileStatus, 'good', 'Template ready ✓');
    state.isCompiling = false;
    els.compileBtn.classList.remove('loading');
    els.compileBtn.disabled = false;
  }, 250);
}

function fillSample() {
  els.tokenName.value = 'Base Token';
  els.tokenSymbol.value = 'BASE';
  els.initialSupply.value = '1000000';
  renderSource();
}

function resetForm() {
  els.tokenName.value = DEFAULTS.tokenName;
  els.tokenSymbol.value = DEFAULTS.tokenSymbol;
  els.initialSupply.value = DEFAULTS.initialSupply;
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
  showToast('Address copied', 'success');
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
      showToast('Address copied to clipboard', 'success');
    }
    if (openTx) openExplorer(`/tx/${openTx}`);
    if (openAddress) openExplorer(`/address/${openAddress}`);
  });
}

async function loadFarcasterContext() { return; }

async function init() {
  try {
    await sdk.actions.ready();
  } catch (error) {
    console.warn('sdk.actions.ready() failed (fine outside Farcaster):', error);
  }

  renderWallet();
  await autoConnectWallet();
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

  [els.tokenName, els.tokenSymbol, els.initialSupply].forEach((input) => {
    input.addEventListener('input', () => {
      renderSource();
    });
  });

  els.connectBtn.addEventListener('click', async () => {
    try {
      await connectWallet();
    } catch (error) {
      log('bad', error?.message || String(error));
      setStatus(els.connectionState, 'warn', 'Disconnected');
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

  els.shareDeployBtn.addEventListener('click', async () => {
    try {
      await shareLatestDeploy();
    } catch (error) {
      log('bad', error?.message || String(error));
      showToast('Failed to open share composer', 'error');
    }
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
  
  // Show welcome toast
  setTimeout(() => {
    showToast('Deploy on Base ready. Connect wallet to start.', 'info');
  }, 800);
}

void init();
