import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benford,paragraphDiff} from '../app/analysis.mjs';
test('Benford counts signs, decimals and scientific notation correctly',()=>{
 const r=benford(Array.from({length:27},(_,i)=>(i%9+1)*1e-12));
 assert.deepEqual(r.distribution.map(d=>d.count),Array(9).fill(3));
 assert.equal(r.n,27);assert.ok(r.mad>=0);
});
test('Benford excludes zero, NaN and infinities',()=>{
 const r=benford([...Array(20).fill(-120),0,NaN,Infinity]);
 assert.equal(r.n,20);assert.equal(r.excluded,3);assert.equal(r.distribution[0].observed,1);
});
test('Benford rejects inadequate sample',()=>assert.throws(()=>benford([1,0,2]),/at least 20/));
test('Expected probabilities sum to one',()=>assert.ok(Math.abs(benford(Array(20).fill(1)).distribution.reduce((s,x)=>s+x.expected,0)-1)<1e-12));
test('Diff identifies additions and deletions',()=>assert.deepEqual(paragraphDiff('A\n\nB','A\n\nC'),[{kind:'Matched',text:'A'},{kind:'Added',text:'C'},{kind:'Deleted',text:'B'}]));
test('Diff preserves duplicate paragraph multiplicity',()=>assert.deepEqual(paragraphDiff('A\n\nA','A'),[{kind:'Matched',text:'A'},{kind:'Deleted',text:'A'}]));
test('Diff handles empty input',()=>assert.deepEqual(paragraphDiff('',''),[]));
