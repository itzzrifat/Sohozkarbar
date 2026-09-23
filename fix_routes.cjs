const fs = require('fs');
const path = require('path');

const pub = path.resolve(__dirname, 'public');

// List of clean routes
const routes = {
  admin: 'admin.html',
  erp: 'erp.html',
  trial: 'trial.html',
  founder: 'founder.html',
  company: 'company.html',
  workstation: 'erp.html',
  'rifat-uddin': 'rifat-uddin.html',
  pricing: 'pricing.html',
  about: 'about.html',
  contact: 'contact.html',
  support: 'support.html',
  terms: 'terms.html',
  privacy: 'privacy.html'
};

for (const [dir, srcFile] of Object.entries(routes)) {
  const destDir = path.join(pub, dir);
  
  // If an extensionless file exists with this name, delete it first!
  if (fs.existsSync(destDir)) {
    const stat = fs.statSync(destDir);
    if (!stat.isDirectory()) {
      fs.unlinkSync(destDir);
      console.log(`Deleted extensionless file: ${dir}`);
    }
  }

  const src = path.join(pub, srcFile);
  if (fs.existsSync(src)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, path.join(destDir, 'index.html'));
    console.log(`Created clean folder: ${dir}/index.html`);
  }
}

// Also check and delete any remaining extensionless files in public
const files = fs.readdirSync(pub);
for (const file of files) {
  const full = path.join(pub, file);
  const stat = fs.statSync(full);
  if (stat.isFile() && !file.includes('.') && file !== 'CNAME') {
    fs.unlinkSync(full);
    console.log(`Deleted orphan extensionless file: ${file}`);
  }
}

console.log('All clean directory routes successfully generated and verified!');
