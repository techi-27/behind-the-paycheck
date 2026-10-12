# Push this project to your GitHub repository

Your repository is: https://github.com/techi-27/behind-the-paycheck

## Windows PowerShell

1. Extract the ZIP file to a folder.
2. Open PowerShell in that extracted folder.
3. Run the commands below. GitHub may open a browser to authenticate you; do not paste a personal access token into chat.

```powershell
git init
git branch -M main
git add .
git commit -m "Add Behind the Paycheck MVP"
git remote add origin https://github.com/techi-27/behind-the-paycheck.git
git push -u origin main
```

If Git says a remote named `origin` already exists, use:

```powershell
git remote set-url origin https://github.com/techi-27/behind-the-paycheck.git
git push -u origin main
```

This project is separate from MR-Career. These commands push only the files in the extracted `behind-the-paycheck` folder.
