// firestore.test.js - Firestore Security Rules Tests
// Run with: npm install --save-dev @firebase/rules-unit-testing
// Then: npm test (or node firestore.test.js)

/**
 * These tests validate that Firestore security rules work correctly.
 * 
 * To run these tests:
 * 1. Install: npm install --save-dev @firebase/rules-unit-testing
 * 2. Make sure Firebase emulator is running: firebase emulators:start
 * 3. Run: node firestore.test.js
 * 
 * Or integrate with your test runner (vitest/jest).
 */

import { 
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'test-project';

let testEnv;

async function setup() {
  // Initialize test environment with rules
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });

  console.log('✓ Test environment initialized');
}

async function cleanup() {
  await testEnv.cleanup();
  console.log('✓ Test environment cleaned up');
}

// Test 1: User can read their own data
async function testUserCanReadOwnData() {
  const alice = testEnv.authenticatedContext('alice');
  const aliceDoc = alice.firestore().doc('users/alice/profile/default');
  
  await setDoc(aliceDoc, { name: 'Alice' });
  await assertSucceeds(getDoc(aliceDoc));
  
  console.log('✓ Test 1 passed: User can read own data');
}

// Test 2: User cannot read other user's data
async function testUserCannotReadOtherData() {
  const alice = testEnv.authenticatedContext('alice');
  const bobDoc = alice.firestore().doc('users/bob/profile/default');
  
  await assertFails(getDoc(bobDoc));
  
  console.log('✓ Test 2 passed: User cannot read other user data');
}

// Test 3: User can write their own data
async function testUserCanWriteOwnData() {
  const alice = testEnv.authenticatedContext('alice');
  const aliceDoc = alice.firestore().doc('users/alice/settings/preferences');
  
  await assertSucceeds(setDoc(aliceDoc, { theme: 'dark' }));
  
  console.log('✓ Test 3 passed: User can write own data');
}

// Test 4: User cannot write to other user's data
async function testUserCannotWriteOtherData() {
  const alice = testEnv.authenticatedContext('alice');
  const bobDoc = alice.firestore().doc('users/bob/settings/preferences');
  
  await assertFails(setDoc(bobDoc, { theme: 'dark' }));
  
  console.log('✓ Test 4 passed: User cannot write to other user data');
}

// Test 5: Unauthenticated user cannot read anything
async function testUnauthenticatedCannotRead() {
  const unauth = testEnv.unauthenticatedContext();
  const doc = unauth.firestore().doc('users/alice/profile/default');
  
  await assertFails(getDoc(doc));
  
  console.log('✓ Test 5 passed: Unauthenticated user cannot read');
}

// Test 6: User can access nested subcollections
async function testNestedCollectionAccess() {
  const alice = testEnv.authenticatedContext('alice');
  const goalDoc = alice.firestore().doc('users/alice/goals/goal1');
  
  await assertSucceeds(setDoc(goalDoc, { subject: 'Math' }));
  await assertSucceeds(getDoc(goalDoc));
  
  console.log('✓ Test 6 passed: User can access nested subcollections');
}

// Test 7: User cannot access other user's nested collections
async function testCannotAccessOtherNestedCollections() {
  const alice = testEnv.authenticatedContext('alice');
  const bobGoalDoc = alice.firestore().doc('users/bob/goals/goal1');
  
  await assertFails(getDoc(bobGoalDoc));
  
  console.log('✓ Test 7 passed: User cannot access other user nested collections');
}

// Run all tests
async function runTests() {
  console.log('\n🧪 Starting Firestore Security Rules Tests...\n');
  
  try {
    await setup();
    
    await testUserCanReadOwnData();
    await testUserCannotReadOtherData();
    await testUserCanWriteOwnData();
    await testUserCannotWriteOtherData();
    await testUnauthenticatedCannotRead();
    await testNestedCollectionAccess();
    await testCannotAccessOtherNestedCollections();
    
    console.log('\n✅ All tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests };

