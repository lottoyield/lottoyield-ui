
const TREE_HEIGHT = 4
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const LOTTOYIELD_ADDR = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
let LOTTOYIELD_ABI
let lottoyield

const rpc_url = 'http://127.0.0.1:8545/'
const rpc = new ethers.JsonRpcProvider(rpc_url)
const wallet = new ethers.Wallet(PRIVATE_KEY, rpc)

fetch('./static/abi.json')
    .then(res => res.json())
    .then(abi => {
        LOTTOYIELD_ABI = abi
        lottoyield = new ethers.Contract(LOTTOYIELD_ADDR, LOTTOYIELD_ABI, wallet)
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

let items = new Array(1 << TREE_HEIGHT).fill(0).map(makeEmptyItem)
async function updateItem(index, delta_amount) {
    delta_amount = BigInt(delta_amount)
    // console.log("updating index", index, "by", un18f2(delta_amount))
    // let tree = merklizeItems(items, TREE_HEIGHT)
    // let localRoot = BigInt(tree[TREE_HEIGHT][0])
    // let chainRoot = await lottoyield.$rootHash()
    // if (localRoot != chainRoot) {
    //     throw new Error('root mismatch')
    // }

    // let new_amount = items[index].balance + delta_amount
    let token = (delta_amount > 0 ? 0 : 1) // eth if deposit, steth if withdraw
    if (items[index].owner == 0) {
        // SECURITY NOTE: the leaf here is not verified against the chain
        // but it will have the same proof such that the root is different
        // but using the proof might be valid, leading to inconsistent states
        // the UI should verify against $rootHash to verify the leaf hasn't deviated
        // (hence the Error('root mismatch') below)
        items[index].owner = wallet.address
    }
    // TODO: use getNewShares() here
    // items[index].shares += delta_amount
    // items[index].balance += delta_amount
    tree = merklizeItems(items, TREE_HEIGHT)
    let proof = getProof(tree, index)
    // let root = calcRoot(proof, tree[0][index] || ZERO_ELEMENT)
    let txn = await lottoyield.update.populateTransaction(index, [delta_amount, token], proof)
    if (delta_amount > 0)
        txn.value = delta_amount
    let resp = await wallet.sendTransaction(txn)
    let receipt = await rpc.waitForTransaction(resp.hash)
    updateStakes(receipt.logs)
}

const E18 = 1000000000000000000n
const E16 = 10000000000000000n
function un18(n) {
    return parseInt(BigInt(n) / E16) / 100.0
}

function f2(n) {
    return n.toFixed(2)
}

function un18f2(n) {
    return f2(un18(n))
}

function uiAddStaker(stake, delta_balance) {
    let staker = document.createElement('p')
    staker.innerHTML = `<span class="staker">${stake.owner} | ${delta_balance>0?'+':''}${un18f2(delta_balance)} | ${un18f2(stake.balance)} / ${un18f2(stake.shares)}</span>`
    el_stakers.appendChild(staker)
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
    await updateItem(0, -0x5n * E18)
}

const evt_StakeUpdate = '0x0c4b0e8211ec0b63fc72dc635e0d45b5e1f32b00b0c8729f668b4522b40192f3'
function updateStakes(logs) {
    logs.filter((log) => log.topics[0] == evt_StakeUpdate).map(onStakeUpdate)
}

async function loadStakes() {
    let logs = await lottoyield.queryFilter('StakeUpdate')
    updateStakes(logs)
}

async function onLoad() {
    loadStakes()
}

// async function getUserSigner() {
//   const provider = new ethers.providers.Web3Provider(window.ethereum);
//   let accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
//   const signer = await provider.getSigner(accounts[0])
//   return signer
// }

