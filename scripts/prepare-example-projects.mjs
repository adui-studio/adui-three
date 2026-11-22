import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recipeIds, createRecipeArchive, repository, sdkArchive } from "./example-recipes.mjs";
import { packageManager } from "./package-manager.mjs";

const generated = join(repository, "examples/.generated");
await mkdir(join(generated, "vendor"), { recursive: true });
await mkdir(join(generated, "downloads"), { recursive: true });
const { command: executable, prefix } = packageManager();
await new Promise((resolve, reject) => {
  const child = spawn(
    executable,
    [...prefix, "pack", "--pack-destination", join(generated, "vendor")],
    { cwd: join(repository, "packages/three"), stdio: "inherit", windowsHide: true },
  );
  child.on("error", reject);
  child.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error(`SDK pack exited ${code}`)),
  );
});
const sdk = await readFile(join(generated, "vendor", sdkArchive));
for (const id of recipeIds)
  for (const language of ["ts", "js"]) {
    const archive = await createRecipeArchive(id, language, sdk);
    await writeFile(join(generated, "downloads", id + "-" + language + ".zip"), archive);
  }
console.log("Prepared 18 standalone projects with local SDK, HTML and required assets.");
