/**
 * Service for fetching book and manga covers from external APIs
 */

export interface CoverResult {
  title: string;
  coverUrl: string;
  source: 'OpenLibrary' | 'AniList' | 'MangaDex';
  author?: string;
  description?: string;
  totalPages?: number;
}

/**
 * Fetch JSON through the local Express proxy when available (dev / node server),
 * falling back to the public API directly (static hosting such as GitHub Pages,
 * where /api/proxy does not exist). All the upstream APIs used here allow CORS.
 */
async function fetchJsonWithFallback(
  proxyUrl: string,
  directUrl: string,
  init?: RequestInit,
): Promise<any> {
  try {
    const res = await fetch(proxyUrl, init);
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('application/json')) {
      return await res.json();
    }
  } catch {
    // proxy unavailable, try direct
  }
  const res = await fetch(directUrl, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface IsbnMetadata {
  title?: string;
  author?: string;
  totalPages?: number;
  coverUrl?: string;
  description?: string;
  genre?: string;
}

/**
 * Look up book metadata by ISBN. Tries Google Books first, then Open Library.
 */
export async function lookupIsbn(rawIsbn: string): Promise<IsbnMetadata | null> {
  const isbn = rawIsbn.replace(/[^0-9Xx]/g, '');
  if (isbn.length !== 10 && isbn.length !== 13) return null;

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await res.json();
    const info = data?.items?.[0]?.volumeInfo;
    if (info) {
      const thumb: string | undefined =
        info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
      return {
        title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
        author: info.authors?.join(', '),
        totalPages: info.pageCount || undefined,
        coverUrl: thumb
          ? thumb.replace('http:', 'https:').replace('&edge=curl', '')
          : undefined,
        description: info.description,
        genre: info.categories?.[0],
      };
    }
  } catch (error) {
    console.error('Google Books lookup error:', error);
  }

  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    );
    const data = await res.json();
    const book = data?.[`ISBN:${isbn}`];
    if (book) {
      return {
        title: book.title,
        author: book.authors?.map((a: any) => a.name).join(', '),
        totalPages: book.number_of_pages,
        coverUrl: book.cover?.large || book.cover?.medium,
        description: typeof book.notes === 'string' ? book.notes : undefined,
      };
    }
  } catch (error) {
    console.error('OpenLibrary ISBN lookup error:', error);
  }
  return null;
}

/**
 * Search for book covers using Open Library API
 */
export async function searchOpenLibrary(title: string): Promise<CoverResult[]> {
  try {
    const data = await fetchJsonWithFallback(
      `/api/proxy/openlibrary?title=${encodeURIComponent(title)}`,
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=8`,
    );

    return (data.docs || [])
      .filter((doc: any) => doc.cover_i)
      .map((doc: any): CoverResult => ({
        title: doc.title,
        author: doc.author_name?.[0],
        coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
        totalPages: doc.number_of_pages_median,
        source: 'OpenLibrary' as const
      }));
  } catch (error) {
    console.error('OpenLibrary search error:', error);
    return [];
  }
}

/**
 * Search for manga covers using AniList API (GraphQL)
 */
export async function searchAniList(title: string): Promise<CoverResult[]> {
  const query = `
    query ($search: String) {
      Page (perPage: 5) {
        media (search: $search, type: MANGA) {
          title {
            romaji
            english
          }
          coverImage {
            large
          }
          description
          staff (perPage: 1) {
            nodes {
              name {
                full
              }
            }
          }
        }
      }
    }
  `;

  const variables = { search: title };

  try {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables
      })
    };
    const data = await fetchJsonWithFallback('/api/proxy/anilist', 'https://graphql.anilist.co', init);

    return (data?.data?.Page?.media || []).map((m: any) => ({
      title: m.title.english || m.title.romaji,
      author: m.staff?.nodes?.[0]?.name?.full,
      coverUrl: m.coverImage.large,
      description: m.description?.replace(/<[^>]*>?/gm, ''), // Remove HTML tags
      source: 'AniList' as const
    }));
  } catch (error) {
    console.error('AniList search error:', error);
    return [];
  }
}

/**
 * Search for manga covers using MangaDex API
 */
export async function searchMangaDex(title: string): Promise<CoverResult[]> {
  try {
    const data = await fetchJsonWithFallback(
      `/api/proxy/mangadex?title=${encodeURIComponent(title)}`,
      `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5&includes[]=cover_art&includes[]=author`,
    );

    if (!data.data) return [];

    return data.data.map((manga: any) => {
      const coverRel = manga.relationships.find((r: any) => r.type === 'cover_art');
      const authorRel = manga.relationships.find((r: any) => r.type === 'author');
      const fileName = coverRel?.attributes?.fileName;
      const mangaId = manga.id;
      
      const titleObj = manga.attributes.title;
      const displayTitle = titleObj.en || titleObj[Object.keys(titleObj)[0]];

      return {
        title: displayTitle,
        author: authorRel?.attributes?.name,
        coverUrl: fileName ? `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg` : '',
        description: manga.attributes.description?.en || manga.attributes.description?.[Object.keys(manga.attributes.description)[0]],
        source: 'MangaDex' as const
      };
    }).filter((res: any) => res.coverUrl);
  } catch (error) {
    console.error('MangaDex search error:', error);
    return [];
  }
}
