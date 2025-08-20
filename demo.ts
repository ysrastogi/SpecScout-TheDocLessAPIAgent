#!/usr/bin/env ts-node

/**
 * Demo script showing the GitHub SDK in action
 * 
 * Set GITHUB_TOKEN environment variable to run:
 * export GITHUB_TOKEN=your_token_here
 * npm run dev
 */

import { GitHubClient } from './sdk';
import * as fs from 'fs/promises';

async function main() {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.error('❌ Please set GITHUB_TOKEN environment variable');
    console.error('   Get one at: https://github.com/settings/tokens');
    process.exit(1);
  }

  console.log('🚀 GitHub SDK Demo Starting...');
  
  const client = new GitHubClient({
    token,
    userAgent: 'DoclessApiAgent-Demo/1.0'
  });

  try {
    // 1. Get current user info
    console.log('\n📋 Getting authenticated user info...');
    const user = await client.getUser();
    console.log(`👤 Hello, ${user.name || user.login}!`);
    console.log(`📧 Email: ${user.email || 'Not public'}`);
    console.log(`⭐ Public repos: ${user.public_repos}`);
    console.log(`👥 Followers: ${user.followers}`);

    // 2. Get rate limit status
    console.log('\n📊 Checking rate limit...');
    const rateLimit = await client.getRateLimit();
    console.log(`🔢 Rate Limit: ${rateLimit.used}/${rateLimit.limit} used, ${rateLimit.remaining} remaining`);
    console.log(`⏰ Resets at: ${new Date(rateLimit.reset * 1000).toLocaleString()}`);

    // 3. List repositories with pagination
    console.log('\n📚 Listing your repositories (first 5)...');
    const repos = await client.getRepositories(undefined, { 
      per_page: 5,
      sort: 'updated',
      direction: 'desc'
    });

    let count = 0;
    for await (const repo of repos) {
      console.log(`📦 ${repo.full_name} (${repo.stargazers_count} ⭐)`);
      console.log(`   ${repo.description || 'No description'}`);
      console.log(`   Last updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
      
      count++;
      if (count >= 5) break; // Limit for demo
    }

    console.log(`\n📈 Processed ${repos.getTotalProcessed()} repositories`);

    // 4. Demonstrate checkpointing
    console.log('\n💾 Testing checkpointing feature...');
    const checkpointFile = './demo-checkpoint.json';
    const reposWithCheckpoint = await client.getRepositories(undefined, {
      per_page: 3,
      checkpointFile,
      saveInterval: 2 // Save every 2 items
    });

    console.log('📝 Processing repos with checkpointing...');
    count = 0;
    for await (const repo of reposWithCheckpoint) {
      console.log(`   📦 ${repo.name} (checkpoint every 2 items)`);
      count++;
      if (count >= 6) break; // Process a few items to trigger checkpoint
    }

    // Check if checkpoint was created
    try {
      const checkpoint = await fs.readFile(checkpointFile, 'utf-8');
      const checkpointData = JSON.parse(checkpoint);
      console.log(`✅ Checkpoint saved: page ${checkpointData.page}, ${checkpointData.total_processed} processed`);
    } catch (error) {
      console.log('⚠️ No checkpoint file found (normal if few repos)');
    }

    // 5. Search repositories
    console.log('\n🔍 Searching for popular JavaScript repositories...');
    const searchResults = await client.searchRepositories('javascript', {
      per_page: 3,
      sort: 'stars',
      direction: 'desc'
    });

    console.log('🏆 Top JavaScript repositories:');
    count = 0;
    for await (const repo of searchResults) {
      console.log(`   ${count + 1}. ${repo.full_name} (${repo.stargazers_count} ⭐)`);
      console.log(`      ${repo.description}`);
      
      count++;
      if (count >= 3) break;
    }

    // 6. Demonstrate error handling and retry
    console.log('\n🔄 Testing retry logic with non-existent user...');
    try {
      await client.getUser('this-user-definitely-does-not-exist-12345');
    } catch (error) {
      console.log(`✅ Handled error gracefully: ${(error as Error).message}`);
    }

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📋 Summary of demonstrated features:');
    console.log('   ✅ Authentication with personal access token');
    console.log('   ✅ Rate limit monitoring and headers');
    console.log('   ✅ Automatic pagination with async iterators');
    console.log('   ✅ Checkpointing for resumable operations');
    console.log('   ✅ Search functionality');
    console.log('   ✅ Error handling and retry logic');
    console.log('   ✅ Repository and user data access');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Clean up checkpoint file on exit
process.on('SIGINT', async () => {
  console.log('\n🧹 Cleaning up demo files...');
  try {
    await fs.unlink('./demo-checkpoint.json');
  } catch (error) {
    // Ignore if file doesn't exist
  }
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}
