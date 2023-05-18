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

let TREE_HEIGHT = 0
let conf
let lottoyield
let steth


// code blessing: may the odds always be in your favor
const jsConfetti = new JSConfetti()
function playConfetti() {
    jsConfetti.addConfetti({
        confettiRadius: 5,
        confettiNumber: 150
    })
    jsConfetti.addConfetti({
        emojis: ['🦄', '💎', '💎', '🪙', '💰', '⚡️', '💥', '✨', '💫', '🔷', '🔹', '♦️'],
        emojiSize: 50,
        confettiNumber: 150
    })
}

let reward_pool = 420.69
const reward_rate = 0.016
function uiRewardPool() {
    reward_pool += reward_rate
    el_rewards.innerText = f2(reward_pool)
}
setInterval(uiRewardPool, 1000)

let browser_provider = new ethers.BrowserProvider(window.ethereum)

const rpc_url = (window.location.hostname != '127.0.0.1' ? 'https://anvil-fork-production.up.railway.app/' : 'http://127.0.0.1:8545/')
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

function makeStake(balance, shares, owner) {
    return {
        balance: BigInt(balance || 0),
        shares: BigInt(shares || 0),
        owner: addr(owner)
    }
}

function makeEmptyItem() {
    return makeStake(0, 0, 0)
}

function makeRound(block, hash, random, reward) {
    return {
        hash: hash,
        total_stakes: (hash % 2n**128n),
        random: BigInt(random),
        lucky: random % (hash % 2n**128n),
        reward: BigInt(reward),
        block: parseInt(block)
    }
    // TODO: find winner
}

// TODO: rename to stakes
let items = []
let rounds = []
let claims = {}

function setDemoText(html) {
    el_demo.style.animation = 'none';
    el_demo.offsetHeight; /* trigger reflow */
    el_demo.style.animation = null; 
    el_demo.innerHTML = html
}

function setManaText(receipt) {
    // let mana_price = receipt.gasPrice
    let mana_str = parseInt(((mana_price * receipt.gasUsed) * 1851n) / E15) / 1000
    el_mana.innerText = `txn price: $${mana_str}`
}

async function updateItem(index, delta_amount, use_wallet=false) {
    if (index < 0 || index > items.length || index >= 2**TREE_HEIGHT) {
        alert('bad index\n(note: new deposits must be the next index which is ' + items.length + ')')
        return false
    }

    // setDemoText('')
    index = parseInt(index)

    let wallet
    if (use_wallet) {
        wallet = user_wallet
    } else {
        // tmp wallet from known private key for demo testing
        wallet = new ethers.Wallet(keys[index % keys.length] || PRIVATE_KEY, rpc)
    }
    
    delta_amount = BigInt(delta_amount)
    console.log("updating index", index, "by", un18f2(delta_amount))
    let tree = merklizeItems(items, TREE_HEIGHT)
    let localRoot = BigInt(tree[TREE_HEIGHT][0])
    let chainRoot = await lottoyield.$rootHash()
    if (localRoot != chainRoot) {
        loadStakesFromStorage()
        setDemoText('D E M O - please wait for transactions to finish')
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
    setManaText(receipt)
    
    setDemoText(`receipt: ${receipt.logs.length} logs`)

    // updateStakes(receipt.logs)
    // TODO: optimize this here
    await loadStakesFromStorage()
    // setDemoText('')
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

const eth_price = 1851
const mana_price = 9746782242n
function eth2usd(eth) {
    return un18(BigInt(eth) * BigInt(eth_price) * 100n) / eth_price
}

function smoleth2usdstr(eth) {
    let usd = parseFloat(eth) * eth_price
    return '$' + f2(usd)
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
        let el_stake = document.createElement('tr')
        el_stake.id = 'el_stake_' + i
         
        let stake = items[i]
        el_stake.innerHTML = `
            <td><a href="https://etherscan.io/address/${stake.owner}">${stake.owner}</a></td>
            <td>${un18f2(stake.balance)}</td>
            <td>${f2(parseInt(stake.shares * 100000n / total_stakes) / 1000)}%</td>
        `
        el_stakers.appendChild(el_stake)
    }
}

function uiTableHistory() {
    el_rounds.innerHTML = ''

    let header = document.createElement('tr')
    header.innerHTML = `
        <th>Round</th>
        <th>Winner</th>
        <th>Reward</th>
        <th>Chance</th>
        <th>Claimed?</th>
    `
    el_rounds.appendChild(header)

    for (let i = rounds.length - 1; i >= 0; i--) {
        let el_round = document.createElement('tr')
        el_round.id = 'el_round_' + i

        let round = rounds[i]
        el_round.innerHTML = `
            <td>${i}</td>
            <td><a href="https://etherscan.io/address/${round.winner}">${round.winner}</a></td>
            <td>$${f2(eth2usd(round.reward))}</td>
            <td>${f2(parseInt(round.winner_shares * 100000n / round.total_stakes) / 1000)}%</td>
            <td>${claims[i] ? 'V' : ''}</td>
        `
        el_rounds.appendChild(el_round)
    }
}

function uiUpdateStake(id) {
    let stake = items[id]
    let el_stake = document.getElementById('stake_' + id)
    if (!el_stake) {
        el_stake = document.createElement('tr')
        el_stakers.appendChild(el_stake)
    }

    el_stake.innerHTML = `
        <td><a href="https://etherscan.io/address/${stake.owner}">${stake.owner}</a></td>
        <td>${un18f2(stake.balance)}</td>
        <td>${f2(parseInt(stake.shares * 100000n / total_stakes) / 1000)}%</td>
        <td></td>
    `
}

async function onEvent_StakeUpdate(log) {
    let [_, depositId, owner] = log.topics
    depositId = parseInt(depositId)
    let [balance, shares] = encoder.decode(['uint128', 'uint128'], log.data)
    // let prev_balance = items[depositId].balance
    // let delta_balance = balance - prev_balance
    // console.log(`[${depositId}] ${owner} ${balance} ${shares}`)
    
    items[depositId] = makeStake(balance, shares, owner)
    // uiUpdateStake(depositId)
}

async function onEvent_RewardClaimed(log) {
    let [_, roundId, owner] = log.topics
    roundId = parseInt(roundId)
    let [reward] = encoder.decode(['uint128'], log.data)
    // ...
    console.log(`[RewardClaimed:${roundId}] ${addr(owner)} ${un18f2(reward)}`)
    claims[roundId] = true
}

async function onEvent_RoundEnded(log) {
    let [_, roundId] = log.topics
    roundId = parseInt(roundId)
    let [hash, random, reward] = encoder.decode(['uint256', 'uint128', 'uint128'], log.data)
    // ...
    let block_num = '0x' + parseInt(log.blockNumber).toString(16)
    // let block = await rpc.getBlock(block_num)
    let round = makeRound(block_num, hash, random, reward)
    // console.log(`[RoundEnded:${roundId}] ${round.lucky}`)
    let calldata = await lottoyield.getWinnerIndex.populateTransaction(round.lucky)
    let winner_index = parseInt(await rpc.send('eth_call', [calldata, block_num]))
    let calldata2 = await lottoyield.getUserShares.populateTransaction(winner_index)
    let winner_shares_at_round = BigInt(await rpc.send('eth_call', [calldata2, block_num]))
    round.winner = items[winner_index].owner
    round.winner_shares = winner_shares_at_round
    // console.log(`winner: ${winner_index}`)
    rounds[roundId] = round
}

let event_callbacks = {
    '0x0c4b0e8211ec0b63fc72dc635e0d45b5e1f32b00b0c8729f668b4522b40192f3': onEvent_StakeUpdate,
    '0xe1b04305f844c23d1b26e3ecb14a18a0a1fe3e3cb103cc9827ab4f2913e2b38e': onEvent_RewardClaimed,
    '0x80dc255f03a584a015e4491ae09e79523771800437d7ae6f0092722684492b38': onEvent_RoundEnded
}

async function processLog(log) {
    let callback = event_callbacks[log.topics[0]]
    if (callback) {
        return callback(log)
    } else {
        console.warn('unprocessed event:', log.topics[0])
    }
}

const DEPLOY_BLOCK = 0 //17280000
const QUERY_MAX_BLOCKS = 10000
async function loadLogs() {
    let start = DEPLOY_BLOCK
    let end = await rpc.getBlockNumber()
    while (start < end) {
        query = {
            address: conf.lottoyield.address,
            fromBlock: start,
            toBlock: end
        }
        let logs = await rpc.getLogs(query)
        let promises = logs.map(processLog)
        await Promise.all(promises)
        start += QUERY_MAX_BLOCKS
    }
}

async function getTotalStakes() {
    let root_hash = await lottoyield.$rootHash()
    let total_stakes = BigInt(root_hash) & ((1n << 128n) - 1n)
    return total_stakes
}

async function loadStakesFromStorage() {
    // TODO: this shouldn't be here
    await updateRewardPool()

    let count = await lottoyield.$countItems()
    if (count == 0) {
        items = []
        return
    }

    items = Array.from(await lottoyield.getStakes(count, 0)).map(({owner, balance, shares}) => {return {owner, balance, shares}})
    
    let total_stakes = await getTotalStakes()
    uiTableStakers(total_stakes)
}

async function updateRewardPool() {
    try {
        let tvl = await steth.balanceOf(conf.lottoyield.address)
        el_tvl.innerText = '$' + f2(eth2usd(tvl))
    } catch (err) {
        console.error('update reward failed:', err)
    }
}

async function sendDeposit(eth) {
    // make sure most up to date wallet is used
    // await walletSoftConnect()

    try {
        let index = await lottoyield.$countItems()
        
        // TODO: remove, this is DEMO ONLY
        index = parseInt(index) % (1 << TREE_HEIGHT)
        use_wallet = true

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
    if (!await walletSoftConnect()) {
        requestAccounts().then(walletSoftConnect)
    }
}

async function onLoad() {
    walletSoftConnect()

    // loadStakesFromStorage()
    
    loadLogs().then(() => {
        getTotalStakes().then(uiTableStakers)
        uiTableHistory()
    })

    // updateRewardPool()
}



/* DEMO UTILS */


function getDemoIndex() {
    return parseInt(el_demo_idx.value)
}

async function testDeposit() {
    await updateItem(getDemoIndex(), BigInt(parseInt(0x1000 * Math.random())) * E16)
}

async function testWithdraw() {
    let idx = getDemoIndex()
    await updateItem(idx, -items[idx].balance)
}

async function testEndRound() {
    let next_block = parseInt(await lottoyield.nextRoundBlock())
    let current_block = parseInt(await rpc.getBlockNumber())
    let dist = next_block - current_block
    if (dist > 0) {
        setDemoText(`forwarding to block ${next_block} (+${dist})`)
        await rpc.send('anvil_mine', [dist.toString(16)])
    }

    let res = await lottoyield.nextRound()
    setDemoText(`sent: ${res.hash}`)
    let receipt = await rpc.waitForTransaction(res.hash)
    setManaText(receipt)

    let log = receipt.logs[0]
    let [root_hash, random, reward] = encoder.decode(['uint256','uint128','uint128'], log.data)
    root_hash = root_hash.toString(16)
    random = random.toString(16)
    setDemoText(`root: ${root_hash.substr(0,3)}..${root_hash.substr(-3)} random: ${random.substr(0,3)}..${random.substr(-3)} reward: ${un18f2(reward)}`)

    await processLog(receipt.logs[0])
    uiTableHistory()
}

async function getWinnerIndex(round_id) {
    let round = await lottoyield.rounds(round_id)
    let total_stakes = round.rootHash & (2n**128n-1n)
    let lucky = round.random % total_stakes
    let sum = 0n
    len = parseInt(await lottoyield.$countItems())
    for (let i = 0; i < len; i++) {
        sum += items[i].shares
        if (sum > lucky)
            return i;
    }
    throw("no lucky winner? (must be a bug)")
}

async function testClaimWin() {
    let count = parseInt(await lottoyield.numRounds())
    if (count == 0) {
        setDemoText('no rounds yet')
        return
    }
    let round_id = count - 1
    let idx = parseInt(getDemoIndex())
    let winner_idx = -1
    try {
        winner_idx = parseInt(await getWinnerIndex(round_id))
    } catch (err) {
    }
    if (idx != winner_idx) {
        setDemoText(`not winner (psst... winner is #${winner_idx})`)
        return
    }

    // claimReward(uint128 roundId, uint128 index, uint128 balance, uint128 shares, uint256[] calldata proof) external {
    let tree = merklizeItems(items, TREE_HEIGHT)
    let proof = getProof(tree, idx)
    try {
        let res = await lottoyield.claimReward(round_id, winner_idx, items[idx].balance, items[idx].shares, proof)
        let receipt = await rpc.waitForTransaction(res.hash)
        setManaText(receipt)
        setDemoText('reward claimed (0 schmekels for demo)')

        playConfetti()

        await processLog(receipt.logs[0])
        uiTableHistory()
    } catch (err) {
        if (err.reason == 'invalid claim proof') {
            testEndRound()
            alert('demo does not yet implement reading events from chain.\n(check again tomorrow)\nfor now, claim rewards immediately after round end.\nlet me do that for you...')
            return
        }
        alert(err)
    }
}

async function testResetChain() {
    setDemoText('resetting test chain...')
    await rpc.send('anvil_reset', [])
    loadStakesFromStorage()
    // setDemoText('')
}