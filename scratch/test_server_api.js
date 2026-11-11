async function test() {
  const base = 'http://localhost:5000/api';
  
  // 1. Health
  const hRes = await fetch(`${base}/health`);
  console.log('Health:', await hRes.json());

  // 2. Initial interactions for Khaadi
  const dealId = 'd1111111-1111-1111-1111-222222222222';
  const iRes = await fetch(`${base}/deals/${dealId}/interactions?userId=user1`);
  console.log('Initial interactions:', await iRes.json());

  // 3. Like it
  const likeRes = await fetch(`${base}/deals/${dealId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user1', userName: 'Zara Khan' }),
  });
  console.log('After like:', await likeRes.json());

  // 4. Add comment
  const commRes = await fetch(`${base}/deals/${dealId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user1', userName: 'Zara Khan', text: 'Yeh deal buhat achi hai!' }),
  });
  console.log('After comment:', await commRes.json());

  // 5. Get batch
  const batchRes = await fetch(`${base}/deals/interactions/batch`);
  console.log('Batch interactions:', await batchRes.json());
}

test().catch(console.error);
