# Daily Amazon Best Seller Check

This is the scheduled daily prompt for Claude Code on the web.

## Task

1. Pull the latest repo changes
2. Run the Amazon Best Seller checker script
3. Read the JSON output
4. Send the email (via SMTP if configured, otherwise create a Gmail draft)
5. Commit updated history.json and push

## Steps to execute

```bash
cd /home/user/bodyj4you
git pull origin claude/intelligent-dirac-6779x6

pip3 install requests beautifulsoup4 lxml -q

cd amazon-bestseller
python3 check_bestseller.py > /tmp/bestseller_result.json 2>/tmp/bestseller_log.txt
cat /tmp/bestseller_result.json
```

Then read `/tmp/bestseller_result.json`:
- If `smtp_sent` is true: email was already sent via SMTP
- If `smtp_sent` is false: use `mcp__Gmail__create_draft` to create a draft with the `html_body` and `subject` fields, addressed to `denis@bodyj4you.com`

Finally commit and push:
```bash
cd /home/user/bodyj4you
git add amazon-bestseller/history.json
git commit -m "Daily Best Seller check $(date +%Y-%m-%d)"
git push -u origin claude/intelligent-dirac-6779x6
```
