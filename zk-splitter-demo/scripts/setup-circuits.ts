import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=== STEP 1: Compiling Circom Circuit ===");
  if (!fs.existsSync("build")) {
    fs.mkdirSync("build", { recursive: true });
  }
  if (!fs.existsSync("contracts")) {
    fs.mkdirSync("contracts", { recursive: true });
  }

  execSync("./bin/circom circuits/splitter.circom --r1cs --wasm --sym -o build/", {
    stdio: "inherit",
  });

  console.log("\n=== STEP 2: Running Powers of Tau (Phase 1) ===");
  const pot0 = "build/pot13_0000.ptau";
  const pot1 = "build/pot13_0001.ptau";
  const potFinal = "build/pot13_final.ptau";

  if (!fs.existsSync(potFinal)) {
    // 2^13 = 8192 constraints, more than enough for our 2423 constraints
    execSync(`npx snarkjs powersoftau new bn128 13 ${pot0}`, { stdio: "inherit" });
    execSync(`npx snarkjs powersoftau contribute ${pot0} ${pot1} --name="ZK-Vault" -v -e="entropy-seed-1"`, {
      stdio: "inherit",
    });
    execSync(`npx snarkjs powersoftau prepare phase2 ${pot1} ${potFinal} -v`, {
      stdio: "inherit",
    });
  } else {
    console.log("Reusing existing powersoftau file.");
  }

  console.log("\n=== STEP 3: Groth16 Setup (Phase 2) ===");
  const zkey0 = "build/splitter_0000.zkey";
  const zkeyFinal = "build/splitter_final.zkey";

  execSync(`npx snarkjs groth16 setup build/splitter.r1cs ${potFinal} ${zkey0}`, {
    stdio: "inherit",
  });
  execSync(`npx snarkjs zkey contribute ${zkey0} ${zkeyFinal} --name="ZK-Vault-Contr" -v -e="entropy-seed-2"`, {
    stdio: "inherit",
  });

  console.log("\n=== STEP 4: Exporting Verification Key & Solidity Verifier ===");
  execSync(`npx snarkjs zkey export verificationkey ${zkeyFinal} build/verification_key.json`, {
    stdio: "inherit",
  });
  execSync(`npx snarkjs zkey export solidityverifier ${zkeyFinal} contracts/Groth16Verifier.sol`, {
    stdio: "inherit",
  });

  console.log("\n>>> Setup completed successfully!");
}

main().catch((err) => {
  console.error("Error during circuit setup:", err);
  process.exit(1);
});
