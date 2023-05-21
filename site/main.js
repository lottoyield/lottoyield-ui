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

el_swap_anim.classList.add('invisible')

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

function getWallet(idx) {
    return new ethers.Wallet(keys[idx % keys.length] || PRIVATE_KEY, rpc)
}

async function updateItem(index, delta_amount, use_wallet=false) {
    if (index < 0 || index > items.length || index >= 2**TREE_HEIGHT) {
        throw Error('bad index\n(note: new deposits must be the next index which is ' + items.length + ')')
        // return false
    }

    // setDemoText('')
    index = parseInt(index)

    let wallet
    if (use_wallet) {
        wallet = user_wallet
    } else {
        // tmp wallet from known private key for demo testing
        wallet = getWallet(index)
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

const token_prices = {
    'eth': 1851,
    'usdc': 1,
    'dai': 1,
    // 'steth': '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    'lido': 1.2,

    'eurs': 1.09,
    'arb': 1.16,
    'pepe': 420.69 / 5,
    'matic': 0.87,
    'usdt': 0.01,

    '1inch': 10000
}

const eth_price = token_prices['eth']
const mana_price = 9746782242n
function token2usd(token, amount) {
    let token_price = token_prices[token] * 10000
    return un18(BigInt(amount) * BigInt(parseInt(token_price))) / 10000
}

function eth2usd(amount) {
    return token2usd('eth', amount)
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

const DEPLOY_BLOCK = 17280000
const QUERY_MAX_BLOCKS = 10000
async function loadLogs() {
    let start = DEPLOY_BLOCK
    let end = await rpc.getBlockNumber()
    if (end < DEPLOY_BLOCK) {
        start = 0
    }

    while (start < end) {
        query = {
            address: conf.lottoyield.address,
            fromBlock: start,
            toBlock: end
        }
        let logs = await rpc.getLogs(query)
        await Promise.all(logs.map(processLog))
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
    // uiTableHistory()
}

function uiShowConversionRate() {
    let amount = BigInt(parseInt(txt_amount.value * 1000)) * E15
    txt_usd_amount.value = '$' + f2(token2usd(g_selectedToken, amount))
}

async function updateRewardPool() {
    try {
        let tvl = await steth.balanceOf(conf.lottoyield.address)
        el_tvl.innerText = '$' + f2(token2usd(g_selectedToken, tvl))
    } catch (err) {
        console.error('update reward failed:', err)
    }
}

async function permitDAI(wallet) {
    data = {
        "types": {
            "EIP712Domain": [
                {
                    "name": "name",
                    "type": "string"
                },
                {
                    "name": "version",
                    "type": "string"
                },
                {
                    "name": "chainId",
                    "type": "uint256"
                },
                {
                    "name": "verifyingContract",
                    "type": "address"
                }
            ],
            "Permit": [
                {
                    "name": "holder",
                    "type": "address"
                },
                {
                    "name": "spender",
                    "type": "address"
                },
                {
                    "name": "nonce",
                    "type": "uint256"
                },
                {
                    "name": "expiry",
                    "type": "uint256"
                },
                {
                    "name": "allowed",
                    "type": "bool"
                }
            ]
        },
        "primaryType": "Permit",
        "domain": {
            "name": "Dai Stablecoin",
            "verifyingContract": "0x6b175474e89094c44da98b954eedeac495271d0f",
            "chainId": 1,
            "version": "1"
        },
        "message": {
            "expiry": parseInt(Date.now() / 1000) + (60*60*24),
            "nonce": 0, // TODO: get nonce
            "spender": "0x1111111254eeb25477b68fb85ed929f73a960582",
            "holder": wallet.address,
            "allowed": true
        }
    }

    delete data.types.EIP712Domain // temp solution like below...
    return wallet.signTypedData(data.domain, data.types, data.message)
}

async function oneInchSwap(wallet, amount) {
    let permit = await permitDAI(wallet)

    wallet.extend = function(a,b,c) {
        wallet.signTypedDataV4 = async function(addr, data) {
            data = JSON.parse(data)
            delete data.types.EIP712Domain
            return wallet.signTypedData(data.domain, data.types, data.message)
        }
        return wallet
    }

    let blockchainProvider = new fusion.Web3ProviderConnector(wallet)
    const sdk = new fusion.FusionSDK({
        url: 'https://fusion.1inch.io',
        network: 1, // parseInt(provider._network.chainId),
        blockchainProvider
    })

    const order = {
        "fromTokenAddress": g_tokens[g_selectedToken],
        "toTokenAddress": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // native ETH; TODO: perhaps ask for stETH?
        "amount": amount,
        "walletAddress": wallet.address,
        permit,
        // "fee": {
        //     "takingFeeBps": 100,
        //     "takingFeeReceiver": "0x0000000000000000000000000000000000000000"
        // }
    }
  
    try {
      let res = await sdk.placeOrder(order)
      console.log(res)
    } catch (err) {
      console.error(err)
    }

    // TODO: is it possible to send order with calldata to directly call lottoyield?
}

async function sendDeposit(eth) {
    // make sure most up to date wallet is used
    // await walletSoftConnect()

    try {
        let index = await lottoyield.$countItems()
        
        // TODO: remove, this is DEMO ONLY
        index = parseInt(index) % (1 << TREE_HEIGHT)

        // TODO: uncomment this if you want to use wallet for signing...
        use_wallet = true
        // use_wallet = false

        // if (g_selectedToken != 'eth') {
        if (g_selectedToken == 'dai') {
            let amount = BigInt(txt_amount.value * 1000) * E15
            let wallet
            // TODO: there is no testnet... only call this in production :(
            if (use_wallet) {
                wallet = user_wallet
            } else {
                wallet = getWallet(index)
            }

            console.log(`[1inch] ${wallet.address} swap ${un18f2(amount)} ${g_selectedToken}`)
            el_swap_anim.classList.remove('invisible')

            try {
               await oneInchSwap(wallet, amount)
            } catch {
                return
            } finally {
                setTimeout(() => { 
                    el_swap_anim.classList.add('invisible')
                }, 3000)
            }
        }

        // WARNING: DO NOT SIGN USING WALLET HERE UNTIL PRODUCTION
        await updateItem(index, eth, false/*use_wallet*/)

        el_swap_anim.classList.add('invisible')

        const jsConfetti = new JSConfetti({ canvas: el_token_canvas })
        jsConfetti.addConfetti({
            emojis: ['🦄', '💰', '⚡️', '✨'],
            emojiSize: 50,
            confettiNumber: 25
        })
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

async function routineUpdate() {
    loadLogs().then(() => {
        getTotalStakes().then((stakes) => {
            uiTableStakers(stakes)
            uiTableHistory()
        })
    })
}

async function onLoad() {
    walletSoftConnect()

    // loadStakesFromStorage()
    
    await routineUpdate()
    setTimeout(routineUpdate, 5000)

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

let g_selectedToken = 'eth'
const g_tokens = {
    'eth': '0xeE',
    'usdc': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'dai': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    // 'steth': '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    'lido': '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',

    'eurs': '0xdB25f211AB05b1c97D595516F45794528a807ad8',
    'arb': '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
    'pepe': '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
    'matic': '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    'usdt': '0xdAC17F958D2ee523a2206206994597C13D831ec7',

    '1inch': '0x111111111117dC0aa78b770fA6A738034120C302'
}

function onToggleTokenClick() {
    let keys = Object.keys(g_tokens)
    let index = keys.indexOf(g_selectedToken)
    index = (index + 1) % keys.length
    g_selectedToken = keys[index]
    let filename = g_selectedToken
    if (g_selectedToken == 'pepe')
        filename += '.png'
    else
        filename += '.svg'

    if (g_selectedToken == 'eth') {
        el_poweredBy.classList.add('invisible')
    } else {
        el_poweredBy.classList.remove('invisible')
    }

    el_img_selectedToken.src = `./static/tokens/${filename}`
    uiShowConversionRate()
}

async function testResetChain() {
    setDemoText('resetting test chain...')
    await rpc.send('anvil_reset', [])
    loadStakesFromStorage()
    // setDemoText('')
}