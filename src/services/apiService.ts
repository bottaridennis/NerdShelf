/**
 * Service for fetching book and manga covers from external APIs
 */

export interface CoverResult {
  title: string;
  coverUrl: string;
  source: 'OpenLibrary' | 'AniList' | 'MangaDex';
  author?: string;
  description?: string;
}

/**
 * Search for book covers using Open Library API
 */
export async function searchOpenLibrary(title: string): Promise<CoverResult[]> {
  try {
    const response = await fetch(`/api/proxy/openlibrary?title=${encodeURIComponent(title)}`);
    const data = await response.json();
    
    return data.docs
      .filter((doc: any) => doc.cover_i)
      .map((doc: any) => ({
        title: doc.title,
        author: doc.author_name?.[0],
        coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
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
    const response = await fetch('/api/proxy/anilist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    const data = await response.json();
    
    return data.data.Page.media.map((m: any) => ({
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
    const response = await fetch(`/api/proxy/mangadex?title=${encodeURIComponent(title)}`);
    const data = await response.json();
    
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
