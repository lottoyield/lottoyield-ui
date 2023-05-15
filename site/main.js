const keys = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
    '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
    '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
    '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
]
const PRIVATE_KEY = keys[0]

let TREE_HEIGHT
let conf
let lottoyield
let steth


let browser_provider = new ethers.BrowserProvider(window.ethereum)

// const rpc_url = 'http://127.0.0.1:8545/'
const rpc_url = 'https://97a3-147-235-197-42.ngrok-free.app'
const rpc = new ethers.JsonRpcProvider(rpc_url)
const empty_wallet = new ethers.Wallet(PRIVATE_KEY, rpc)
let user_wallet

fetch('./static/conf.json')
    .then(res => res.json())
    .then(async (json) => {
        conf = json
        steth = new ethers.Contract(conf.steth.address, conf.steth.abi, empty_wallet)
        lottoyield = new ethers.Contract(conf.lottoyield.address, conf.lottoyield.abi, empty_wallet)
        TREE_HEIGHT = parseInt(await lottoyield.TREE_HEIGHT())

        onLoad()
    })

let encoder = new ethers.AbiCoder()
let addr = (a) => '0x' + (new ethers.AbiCoder()).encode(['uint160'], [a]).slice(26)
let uint128 = (n) => '0x' + (new ethers.AbiCoder()).encode(['uint128'], [n]).slice(34)
let int128 = (n) => '0x' + (new ethers.AbiCoder()).encode(['int128'], [n]).slice(34)

function makeItem(balance, shares, owner) {
    return {
        balance: BigInt(balance || 0),
        shares: BigInt(shares || 0),
        owner: addr(owner)
    }
}

function makeEmptyItem() {
    return makeItem(0, 0, 0)
}

let items = []

function setDemoText(html) {
    el_demo.style.animation = 'none';
    el_demo.offsetHeight; /* trigger reflow */
    el_demo.style.animation = null; 
    el_demo.innerHTML = html
}

async function updateItem(index, delta_amount, use_wallet=false) {
    setDemoText('')
    let wallet
    if (use_wallet) {
        wallet = user_wallet
    } else {
        // tmp wallet from known private key for demo testing
        wallet = new ethers.Wallet(keys[index] || PRIVATE_KEY, rpc)
    }
    
    index = parseInt(index)
    delta_amount = BigInt(delta_amount)
    console.log("updating index", index, "by", un18f2(delta_amount))
    let tree = merklizeItems(items, TREE_HEIGHT)
    let localRoot = BigInt(tree[TREE_HEIGHT][0])
    let chainRoot = await lottoyield.$rootHash()
    if (localRoot != chainRoot) {
        updateRewardPool()
        alert('D E M O - please wait for transactions to finish\n(some wallets lose track of transactions, let me refresh that for you)')
        throw new Error('root mismatch')
    }

    let token = (delta_amount > 0 ? 0 : 1) // eth if deposit, steth if withdraw
    if (!items[index]) {
        items[index] = makeEmptyItem()
    }
    if (!items[index].owner == 0) {
        // SECURITY NOTE: the leaf here is not verified against the chain
        // but it will have the same proof such that the root is different
        // but using the proof might be valid, leading to inconsistent states
        // the UI should verify against $rootHash to verify the leaf hasn't deviated
        // (hence the Error('root mismatch') below)
        items[index].owner = wallet.address
    }
    // TODO: use getNewShares() here
    // let new_amount = items[index].balance + delta_amount
    // items[index].shares += delta_amount
    // items[index].balance += delta_amount
    tree = merklizeItems(items, TREE_HEIGHT)
    let proof = getProof(tree, index)
    // let root = calcRoot(proof, tree[0][index] || ZERO_ELEMENT)
    let txn = await lottoyield.update.populateTransaction(index, [delta_amount, token], proof)
    if (delta_amount > 0)
        txn.value = delta_amount

    setDemoText(`${delta_amount > 0 ? 'deposit' : 'withdraw'} ${un18f2(delta_amount)} eth using address ${wallet.address}`)
    let resp = await wallet.sendTransaction(txn)
    setDemoText(`sent: ${resp.hash}`)

    let receipt = await rpc.waitForTransaction(resp.hash)
    
    setDemoText(`receipt: ${receipt.logs.length} logs`)

    // updateStakes(receipt.logs)
    // TODO: optimize this here
    await loadStakesFromStorage()
    setDemoText('')
}

const E18 = 1000000000000000000n
const E16 = 10000000000000000n
const E15 = 1000000000000000n
function un18(n) {
    return parseInt(BigInt(n) / E15) / 1000.0
}

function f2(n) {
    return ((n * 1000) / 1000).toFixed(2)
}

function un18f2(n) {
    return f2(un18(n))
}

function eth2usd(eth) {
    const eth_price = 1851
    return un18(BigInt(eth) * BigInt(eth_price) * 100n) / eth_price
}

function eth2usdstr(eth) {
    const eth_price = 1851
    let usd = parseFloat(eth) * eth_price
    return '$' + f2(usd)
}

function uiAddStaker(stake, delta_balance) {
    let staker = document.createElement('tr')
    staker.innerHTML = `
        <td>${stake.owner}</td>
        <td>${delta_balance>0?'+':''}${un18f2(delta_balance)}</td>
        <td>${un18f2(stake.balance)} / ${un18f2(stake.shares)}</td>
    `
    el_stakers.appendChild(staker)
}

function uiTableStakers(total_stakes) {
    if (total_stakes == 0n)
        total_stakes = 1n

    el_stakers.innerHTML = ''
    let header = document.createElement('tr')
    header.innerHTML = `
        <th>Owner</th>
        <th>Balance</th>
        <th>Chance</th>
    `
    el_stakers.appendChild(header)

    for (let i = 0; i < items.length; i++) {
        let staker = document.createElement('tr')
        let stake = items[i]
        staker.innerHTML = `
            <td>${stake.owner}</td>
            <td>${un18f2(stake.balance)}</td>
            <td>${f2(parseInt(stake.shares * 100000n / total_stakes) / 1000)}%</td>
        `
        el_stakers.appendChild(staker)
    }
}

function onStakeUpdate(log) {
    let [_, depositId, owner] = log.topics
    depositId = parseInt(depositId)
    let [balance, shares] = encoder.decode(['uint128', 'uint128'], log.data)
    let prev_balance = items[depositId].balance
    let delta_balance = balance - prev_balance
    items[depositId] = makeItem(balance, shares, owner)
    // console.log(`[${depositId}] ${owner} ${balance} ${shares}`)
    uiAddStaker(items[depositId], delta_balance)
}

async function test() {
    await updateItem(0, 0x10n * E18)
    await updateItem(1, 0x20n * E18)
    await updateItem(2, 0x40n * E18)
    await updateItem(0, -0x5n * E18)
    await updateItem(1, 0x20n * E18)
    await updateItem(3, 0x33n * E18)
    await updateItem(4, 0x20n * E18)
    await updateItem(2, 0x60n * E18)
    await updateItem(5, 0x55n * E18)
    await updateItem(0, 0x10n * E18)
}

const evt_StakeUpdate = '0x0c4b0e8211ec0b63fc72dc635e0d45b5e1f32b00b0c8729f668b4522b40192f3'
function updateStakes(logs) {
    logs.filter((log) => log.topics[0] == evt_StakeUpdate).map(onStakeUpdate)
}

async function loadStakesFromEvents() {
    let logs = await lottoyield.queryFilter('StakeUpdate')
    updateStakes(logs)
}

async function loadStakesFromStorage() {
    let count = await lottoyield.$countItems()
    if (count == 0) {
        items = []
        return
    }

    let rootHash = await lottoyield.$rootHash()
    let totalStakes = BigInt(rootHash) & ((1n << 128n) - 1n)
    items = Array.from(await lottoyield.getStakes(count, 0)).map(({owner, balance, shares}) => {return {owner, balance, shares}})
    uiTableStakers(totalStakes)
    
    // TODO: this shouldn't be here
    await updateRewardPool()
}

async function updateRewardPool() {
    let tvl = await steth.balanceOf(conf.lottoyield.address)
    el_tvl.innerText = '$' + f2(eth2usd(tvl))
}

async function sendDeposit(eth) {
    // make sure most up to date wallet is used
    // await walletSoftConnect()

    try {
        let index = await lottoyield.$countItems()
        
        // TODO: remove, this is DEMO ONLY
        index = parseInt(index) % keys.length
        use_wallet = false // true

        await updateItem(index, eth, use_wallet)
    } catch (err) {
        // refresh items to sync back in case of error (temp solution)
        await loadStakesFromStorage()
        throw err
    }
}

async function requestAccounts() {
    return window.ethereum.request({ method: "eth_requestAccounts" })
}

// get account info only if wallet already connected
async function walletSoftConnect() {
    let accounts = await window.ethereum.request({ method: "eth_accounts" })
    if (!accounts || accounts.length == 0) {
        return false
    }

    user_wallet = await browser_provider.getSigner(0)
    btn_connect.value = accounts[0]
    return true
}

// pop-up wallet extension if necessary
async function walletHardConnect() {
    if (!walletSoftConnect()) {
        requestAccounts().then(walletSoftConnect)
    }
}

async function onLoad() {
    walletSoftConnect()

    loadStakesFromStorage()
    // updateRewardPool()
}
