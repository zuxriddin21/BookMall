export type Role = 'READER' | 'BLOGGER' | 'SELLER' | 'PUBLISHER' | 'ADMIN';
export type Shelf = 'WANT_TO_READ' | 'READING' | 'READ';

export interface Me {
  id: string; username: string; name: string; email: string | null; avatar: string | null; bio: string | null; phone: string | null;
  roles: Role[]; needsRoleSelection: boolean; subscriptionPlan: string; googleLinked: boolean; createdAt: string;
}
export interface Store {
  id: string; name: string; slug: string; description: string | null; logoUrl: string | null; phone: string | null; city: string | null;
  address: string | null; verified: boolean; followersCount?: number; isFollowing?: boolean; isMine?: boolean;
}
export interface Publisher {
  id: string; name: string; slug: string; description: string | null; logoUrl: string | null; website: string | null; phone: string | null;
  city: string | null; foundedYear: number | null; verified: boolean; followersCount?: number; isFollowing?: boolean; isMine?: boolean;
}
export interface BloggerProfile { headline: string | null; coverUrl: string | null; website: string | null }
export interface MeResponse { user: Me; store: Store | null; publisher: Publisher | null; bloggerProfile: BloggerProfile | null }

export interface Category { id: number; slug: string; name: string }
export interface Book {
  id: string; title: string; author: string; isbn13: string | null; coverUrl: string | null; description: string | null; language: string;
  publishedYear: number | null; pageCount: number | null; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  publisher: { id: string | null; slug: string | null; name: string } | null; category: Category | null;
  minPrice: number | null; offersCount: number; myShelf: Shelf | null; rejectionReason?: string | null;
}
export interface Offer {
  id: string; price: number; quantity: number; condition: 'NEW' | 'USED'; description: string | null; photos: string[];
  store: { id: string; name: string; slug: string; logoUrl: string | null; city: string | null; verified: boolean };
}
export interface Listing {
  id: string; price: number; quantity: number; condition: 'NEW' | 'USED'; description: string | null; photos: string[];
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'; book: { id: string; title: string; author: string; coverUrl: string | null; status: string };
}
export interface Order {
  id: string; number: number; status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'; total: number;
  contactName: string; contactPhone: string; address: string; note: string | null; createdAt: string; buyerId: string | null;
  store: { id: string; name: string; slug: string; phone: string | null };
  items: { id: string; listingId: string | null; bookId: string | null; title: string; unitPrice: number; quantity: number }[];
}
export type PostType = 'GENERAL' | 'REVIEW' | 'RECOMMENDATION' | 'NEW_ARRIVAL' | 'PROMOTION' | 'ANNOUNCEMENT' | 'NEW_RELEASE' | 'NEWS' | 'REPOST';
export interface MediaItem { kind: 'image' | 'video'; url: string }
export interface Post {
  id: string; type: PostType; body: string | null; rating: number | null; media: MediaItem[]; createdAt: string; deleted: boolean;
  author: { id: string; username: string; name: string; avatar: string | null };
  postedAs: { type: 'USER' | 'STORE' | 'PUBLISHER'; id: string; name: string; slug: string; logoUrl: string | null; verified: boolean };
  book: { id: string; title: string; author: string; coverUrl: string | null } | null;
  likeCount: number; commentCount: number; repostCount: number; likedByMe: boolean; repostedByMe: boolean;
  repostOf: (Post & { deleted?: false }) | { id: string; deleted: true } | null;
}
export interface Comment { id: string; body: string; createdAt: string; author: { id: string; username: string; name: string; avatar: string | null }; canDelete: boolean }
export interface Notification {
  id: string; category: 'SOCIAL' | 'ORDER' | 'SYSTEM'; type: string; text: string; postId: string | null; orderId: string | null; bookId: string | null;
  actor: { id: string; username: string; name: string; avatar: string | null } | null; read: boolean; createdAt: string;
}
export interface ShelfEntry { shelf: Shelf; rating: number | null; currentPage: number; notes: string | null; book: Book }
export interface PublicProfile {
  user: { id: string; username: string; name: string; avatar: string | null; bio: string | null; createdAt: string; roles: Role[] };
  bloggerProfile: BloggerProfile | null;
  store: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  publisher: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  stats: { followersCount: number; followingCount: number; postsCount: number; booksReadCount: number };
  isFollowing: boolean; isMe: boolean;
}
export interface Paged<T> { items: T[]; nextCursor: string | null }
export interface AuthTokens { accessToken: string; refreshToken: string; expiresIn: number }
