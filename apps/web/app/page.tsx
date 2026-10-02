import { agentsName } from "@verisci/agents";
import { contractsName } from "@verisci/contracts";
import { coreName } from "@verisci/core";
import { dkgName } from "@verisci/dkg";
import { envName } from "@verisci/env";

const packages = [envName, coreName, dkgName, contractsName, agentsName];

export default function Home() {
  return (
    <main>
      <h1>verisci</h1>
      <ul>
        {packages.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </main>
  );
}
