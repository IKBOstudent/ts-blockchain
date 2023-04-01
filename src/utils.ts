import * as crypto from "crypto";
import { ec, SignatureInput } from "elliptic";

const EC = new ec("secp256k1");

export function generateAddress(publicKey: string): string {
    return crypto.createHash("sha3-256").update(publicKey.slice(2)).digest("hex").slice(-40);
}

export function generatePublicPrivateKeys(): { privateKey: string; publicKey: string } {
    const keyPair = EC.genKeyPair();
    return {
        privateKey: keyPair.getPrivate("hex"),
        publicKey: keyPair.getPublic("hex"),
    };
}

export function signTransaction(
    transactionHash: string,
    privateKey: string
): { signature: string; recoveryParam: number } {
    const sig = EC.sign(Buffer.from(transactionHash, "hex"), EC.keyFromPrivate(privateKey));
    return { signature: sig.toDER("hex"), recoveryParam: sig.recoveryParam || 0 };
}
