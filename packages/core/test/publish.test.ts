import { describe, expect, it } from 'vitest';
import type { Agent } from '@atproto/api';
import { publishArticle, publishPost, publishThread, type PublishContext } from '../src/publish.ts';
import { newDraft, type ThreadProgress } from '../src/types.ts';

/** In-memory stand-in for a PDS, enough to exercise the publish flows. */
function fakeAgent(opts: { failCreateAt?: number; dropApplyWritesResponse?: boolean } = {}) {
  const repo = new Map<string, { cid: string; value: any }>();
  let creates = 0;
  let cidN = 0;
  const put = (uri: string, value: any) => {
    const cid = `bafy${++cidN}`;
    repo.set(uri, { cid, value });
    return { uri, cid };
  };
  const agent = {
    uploadBlob: async (blob: Blob) => ({
      data: { blob: { ref: { $link: `blob${blob.size}` }, mimeType: blob.type, size: blob.size } },
    }),
    com: {
      atproto: {
        repo: {
          createRecord: async ({ repo: did, collection, rkey, record }: any) => {
            creates++;
            if (opts.failCreateAt === creates) throw new Error('network down');
            return { data: put(`at://${did}/${collection}/${rkey}`, record) };
          },
          getRecord: async ({ repo: did, collection, rkey }: any) => {
            const uri = `at://${did}/${collection}/${rkey}`;
            const hit = repo.get(uri);
            if (!hit) throw new Error('RecordNotFound');
            return { data: { uri, cid: hit.cid, value: hit.value } };
          },
          putRecord: async ({ repo: did, collection, rkey, record }: any) => ({
            data: put(`at://${did}/${collection}/${rkey}`, record),
          }),
          listRecords: async ({ repo: did, collection }: any) => ({
            data: {
              records: [...repo.entries()]
                .filter(([uri]) => uri.startsWith(`at://${did}/${collection}/`))
                .map(([uri, r]) => ({ uri, cid: r.cid, value: r.value })),
            },
          }),
          applyWrites: async ({ repo: did, writes }: any) => {
            if (writes.some((w: any) => repo.has(`at://${did}/${w.collection}/${w.rkey}`))) {
              throw new Error('Record already exists');
            }
            const results = writes.map((w: any) => put(`at://${did}/${w.collection}/${w.rkey}`, w.value));
            // The writes landed, but the response never made it back.
            if (opts.dropApplyWritesResponse) {
              opts.dropApplyWritesResponse = false;
              throw new Error('network down');
            }
            return { data: { results } };
          },
        },
      },
    },
  };
  return { agent: agent as unknown as Agent, repo };
}

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
const threadText = [para(40), para(40), para(40)].join('\n\n');

describe('publishThread', () => {
  it('chains replies to root and parent', async () => {
    const { agent, repo } = fakeAgent();
    const ctx: PublishContext = { agent, did: 'did:plc:me', appOrigin: 'https://spool.test' };
    const result = await publishThread(ctx, newDraft({ text: threadText }));
    expect(result.kind).toBe('thread');
    const posts = [...repo.values()].map((r) => r.value);
    expect(posts).toHaveLength(3);
    expect(posts[0].reply).toBeUndefined();
    expect(posts[1].reply.root.uri).toBe(result.uri);
    expect(posts[2].reply.parent.uri).toBe([...repo.keys()][1]);
  });

  it('resumes after a failure without double-posting', async () => {
    const { agent, repo } = fakeAgent({ failCreateAt: 2 });
    const ctx: PublishContext = { agent, did: 'did:plc:me', appOrigin: 'https://spool.test' };
    const draft = newDraft({ text: threadText });
    let saved: ThreadProgress | undefined;
    await expect(publishThread(ctx, draft, { onThreadProgress: (p) => void (saved = p) })).rejects.toThrow(
      'network down',
    );
    expect(saved!.created.filter(Boolean)).toHaveLength(1);
    expect(repo.size).toBe(1);

    const result = await publishThread(ctx, { ...draft, threadProgress: saved });
    expect(repo.size).toBe(3);
    expect(result.uri).toBe(saved!.created[0]!.uri);
  });
});

describe('publishArticle', () => {
  it('writes a publication, a document and a linked post', async () => {
    const { agent, repo } = fakeAgent();
    const ctx: PublishContext = { agent, did: 'did:plc:me', handle: 'me.test', appOrigin: 'https://spool.test/' };
    const result = await publishArticle(ctx, newDraft({ text: '# Hello\n\nFirst paragraph here.\n\nMore.' }));
    if (result.kind !== 'article') throw new Error('wrong kind');

    const values = [...repo.entries()];
    const pub = values.find(([u]) => u.includes('site.standard.publication'))![1].value;
    const doc = values.find(([u]) => u.includes('site.standard.document'))![1].value;
    const post = values.find(([u]) => u.includes('app.bsky.feed.post'))![1].value;

    expect(pub.url).toBe('https://spool.test/did:plc:me');
    expect(doc.title).toBe('Hello');
    expect(doc.site).toMatch(/^at:\/\/did:plc:me\/site\.standard\.publication\//);
    expect(result.url).toBe(`https://spool.test/did:plc:me${doc.path}`);
    expect(doc.bskyPostRef.uri).toBe(result.postUri);
    expect(post.embed.external.uri).toBe(result.url);
    expect(post.text).toBe('Hello\n\nFirst paragraph here.');

    // A second article reuses the same publication.
    await publishArticle(ctx, newDraft({ text: 'Another one, long enough.' }));
    expect([...repo.keys()].filter((u) => u.includes('site.standard.publication'))).toHaveLength(1);
  });
});

describe('reserved record keys', () => {
  it('lets a post retry without posting twice', async () => {
    const { agent, repo } = fakeAgent({ failCreateAt: 1 });
    const ctx: PublishContext = { agent, did: 'did:plc:me', appOrigin: 'https://spool.test' };
    const draft = newDraft({ text: 'Hello there', rkeys: ['3kaaaaaaaaaa2'] });
    // The first create fails outright; the retry writes to the same key.
    await expect(publishPost(ctx, draft)).rejects.toThrow('network down');
    const result = await publishPost(ctx, draft);
    expect(result.uri).toBe('at://did:plc:me/app.bsky.feed.post/3kaaaaaaaaaa2');
    expect(repo.size).toBe(1);
  });

  it('recovers an article whose writes landed but whose response was lost', async () => {
    const { agent, repo } = fakeAgent({ dropApplyWritesResponse: true });
    const ctx: PublishContext = { agent, did: 'did:plc:me', appOrigin: 'https://spool.test' };
    const draft = newDraft({ text: '# Hi\n\nBody text.', rkeys: ['3kdddddddddd2', '3kpppppppppp2'] });
    const result = await publishArticle(ctx, draft);
    if (result.kind !== 'article') throw new Error('wrong kind');
    expect(result.documentUri).toBe('at://did:plc:me/site.standard.document/3kdddddddddd2');
    expect(result.postUri).toBe('at://did:plc:me/app.bsky.feed.post/3kpppppppppp2');
    // Publication, document and post: nothing written twice.
    expect(repo.size).toBe(3);
    expect(repo.get(result.documentUri)!.value.bskyPostRef.uri).toBe(result.postUri);
  });

  it('still fails an article when nothing landed', async () => {
    const { agent } = fakeAgent();
    (agent as any).com.atproto.repo.applyWrites = async () => {
      throw new Error('PDS down');
    };
    const ctx: PublishContext = { agent, did: 'did:plc:me', appOrigin: 'https://spool.test' };
    const draft = newDraft({ text: '# Hi\n\nBody.', rkeys: ['3kdddddddddd2', '3kpppppppppp2'] });
    await expect(publishArticle(ctx, draft)).rejects.toThrow('PDS down');
  });
});
