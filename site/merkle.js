function hex(n) {
    return '0x' + BigInt(n).toString(16).padStart(64, '0')
}

function makeElement({balance, shares, owner}) {
    // so this was replaced by abi.encode instead of abi.encodePacked becuase abi.encodePacked doesn't work for structs?
    // supposedly safer, should check to see how much it costs if can get it to work... for now everything is uint256.
    let hash = ethers.solidityPackedKeccak256(['uint256', 'uint256', 'uint256'], [balance, shares, owner])
    hash = ((BigInt(hash) % (2n**128n)) << 128n) | BigInt(shares)
    return hex(hash)
}
const ZERO_ELEMENT = makeElement({balance: 0, shares: 0, owner: 0})

function hashItems(hash1, hash2) {
    // console.log(`item1 = ${hash1}, item2 = ${hash2}`)
    if (BigInt(hash1) < BigInt(hash2)) {
        [hash1, hash2] = [hash2, hash1]
    }
    let hash = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [hash1, hash2]);
    let amount1 = BigInt(hash1) % (2n**128n);
    let amount2 = BigInt(hash2) % (2n**128n);
    return hex((((BigInt(hash) % (2n**128n)) << 128n) | (amount1 + amount2)))
}

function getItem(items, index, max_len) {
    if (index < max_len)
        return items[index];
    else
        return ZERO_ELEMENT
}

function merklizeItems(items, height) {
    hashes = items.map(makeElement)
    // max 2**height elements
    let len = 2 ** height
    let buckets = [hashes.concat(Array(len - hashes.length).fill(ZERO_ELEMENT))]
    for (let level = 0; level < height; level++) {
        for (let i = 0; i < len; i++) {
            // console.log("level = %d, i = %d", level, i);
            let minLen = (hashes.length < len ? hashes.length : len);
            let item1 = getItem(hashes, 2 * i, minLen)
            let item2 = getItem(hashes, 2 * i + 1, minLen)
            hashes[i] = hashItems(item1, item2)
        }
        len >>= 1;
        buckets.push(hashes.slice(0, len))
    }

    return buckets
}

function getProof(tree, index) {
    if (index < 0 || index >= tree[0].length)
        throw 'index out of bounds'

    let proof = []
    for (let level = 0; level < tree.length - 1; level++) {
        let proof_item = tree[level][index ^ 1]// || ZERO_ELEMENT
        proof.push(proof_item)
        index >>= 1
    }

    return proof
}

function calcRoot(_proof, _leaf) {
    let computedHash = _leaf;
    for (let i = 0; i < _proof.length; i++) {
      computedHash = hashItems(computedHash,  _proof[i]);
    }

    return computedHash;
}
