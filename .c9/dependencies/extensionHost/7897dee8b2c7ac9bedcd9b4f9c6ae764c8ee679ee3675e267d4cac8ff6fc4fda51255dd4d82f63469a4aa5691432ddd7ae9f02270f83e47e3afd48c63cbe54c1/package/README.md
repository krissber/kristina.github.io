### How to add and test an extension from vscode marketplace
- Download a `vsix` file from the marketplace (e.g. https://marketplace.visualstudio.com/items?itemName=AmazonWebServices.aws-toolkit-vscode)
- Put the file in `overrides/example-extensions` folder
- Run `brazil-build`

### Procedure for upgrading vscode:
- Find a full hash of a vscode commit that you want to update to.
- Update `vscodeHash` field in our `package.json`.
- Run `npm run prepare`. New vscode archive will be downloaded, `package.json` will be updated.
- If there are new dependencies, make sure that we need them. If we don't, move them to `ignoredDependencies`.
- Build and test locally, update `overrides` if necessary.
- Remove the old vscode archive.
- Create a CR.
- There is a chance that our internal npm index would not have some dependencies and the build will fail. In this case request a merge with live VS. If it doesn't help, downgrade vscode.
