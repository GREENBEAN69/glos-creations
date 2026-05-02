import React, { useState, useEffect } from 'react';
import { ShoppingBag, Heart, Menu, X, Instagram, Mail, MapPin, Search, ArrowRight, Star } from 'lucide-react';

export default function GlosCreations() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');

  // YOUR SHOPIFY STORE - UPDATE THIS
  const SHOPIFY_STORE = 'mtudcn-dy.myshopify.com';

  // Demo products - these will show while you're getting the API set up
  // Once you have your API token, these will be replaced with live data
  const demoProducts = [
    { 
      id: '1', 
      handle: 'demo-1',
      name: 'Product 1', 
      price: 0,
      category: 'Jewelry', 
      image: null,
      description: 'Loading from your Shopify store...'
    },
    { 
      id: '2', 
      handle: 'demo-2',
      name: 'Product 2', 
      price: 0,
      category: 'Jewelry', 
      image: null,
      description: 'Loading from your Shopify store...'
    },
  ];

  useEffect(() => {
    // For now, use demo products
    // Once you get your Storefront API token, replace the SHOPIFY_ACCESS_TOKEN below
    // and uncomment the fetchProducts() call
    
    setProducts(demoProducts);
    setLoading(false);

    // Uncomment this when you have your API token:
    // fetchProducts();
  }, []);

  // This function will work once you have your Storefront API token
  const fetchProducts = async () => {
    try {
      // You'll need to add your actual token here
      const SHOPIFY_ACCESS_TOKEN = 'YOUR_STOREFRONT_ACCESS_TOKEN_HERE';
      
      const query = `
        query {
          products(first: 50) {
            edges {
              node {
                id
                title
                handle
                description
                priceRange {
                  minVariantPrice {
                    amount
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                productType
              }
            }
          }
        }
      `;

      const response = await fetch(`https://${SHOPIFY_STORE}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      
      if (data.data?.products?.edges) {
        const formattedProducts = data.data.products.edges.map(({ node }) => ({
          id: node.id,
          handle: node.handle,
          name: node.title,
          price: parseFloat(node.priceRange.minVariantPrice.amount),
          category: node.productType || 'Jewelry',
          image: node.images.edges[0]?.node.url,
          description: node.description,
        }));
        setProducts(formattedProducts);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching from Shopify:', error);
      setProducts(demoProducts);
      setLoading(false);
    }
  };

  const categories = ['All', 'Earrings', 'Necklaces', 'Rings', 'Bracelets'];
  const filteredProducts = activeCategory === 'All'
    ? products
    : products.filter(p => p.category === activeCategory);

  const addToCart = (product) => {
    setCart([...cart, product]);
  };

  const goToCheckout = () => {
    // Redirect to your Shopify store for checkout
    window.location.href = `https://${SHOPIFY_STORE}/cart`;
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      {/* Announcement bar */}
      <div className="bg-stone-900 text-stone-100 text-center py-2 text-xs tracking-[0.2em] uppercase">
        Free shipping on orders over $75 · Handmade with love
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-stone-50/90 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between h-20">
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden">
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div className="hidden md:flex gap-10 text-sm tracking-[0.15em] uppercase font-sans" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '0.15em', fontSize: '0.72rem' }}>
              <a href="#shop" className="text-stone-700 hover:text-stone-900 transition">Shop</a>
              <a href="#collections" className="text-stone-700 hover:text-stone-900 transition">Collections</a>
              <a href="#about" className="text-stone-700 hover:text-stone-900 transition">About</a>
              <a href="#contact" className="text-stone-700 hover:text-stone-900 transition">Contact</a>
            </div>

            <a href="#" className="absolute left-1/2 transform -translate-x-1/2 text-2xl tracking-wider italic">
              Glo's <span className="font-light">Creations</span>
            </a>

            <div className="flex items-center gap-5">
              <button className="hidden md:block"><Search size={18} className="text-stone-700" /></button>
              <button><Heart size={18} className="text-stone-700" /></button>
              <button className="relative" onClick={goToCheckout}>
                <ShoppingBag size={18} className="text-stone-700" />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-stone-900 text-stone-50 text-[10px] rounded-full w-4 h-4 flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {cart.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-stone-200 bg-stone-50 py-4 px-6">
            <div className="flex flex-col gap-4 text-sm tracking-widest uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>
              <a href="#shop">Shop</a>
              <a href="#collections">Collections</a>
              <a href="#about">About</a>
              <a href="#contact">Contact</a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-stone-500 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
                Handcrafted Polymer Clay
              </p>
              <h1 className="text-6xl lg:text-7xl xl:text-8xl leading-[0.95] mb-8 font-light">
                Wearable<br />
                <span className="italic">artistry,</span><br />
                made by hand.
              </h1>
              <p className="text-stone-600 text-lg mb-10 max-w-md leading-relaxed">
                Each piece is sculpted, shaped, and finished one at a time — small batch jewelry designed to feel like nothing else.
              </p>
              <div className="flex gap-4 items-center">
                <a href="#shop" className="bg-stone-900 text-stone-50 px-8 py-4 text-xs tracking-[0.2em] uppercase hover:bg-stone-800 transition flex items-center gap-3" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Shop the Collection <ArrowRight size={14} />
                </a>
                <a href="#about" className="text-xs tracking-[0.2em] uppercase border-b border-stone-900 pb-1 hover:opacity-60 transition" style={{ fontFamily: "'Inter', sans-serif" }}>
                  Our Story
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="aspect-[4/5] bg-gradient-to-br from-stone-200 via-stone-100 to-neutral-200 rounded-sm relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div className="w-48 h-48 rounded-full bg-gradient-to-br from-stone-50 to-stone-300 shadow-2xl"></div>
                    <div className="absolute top-12 -right-8 w-24 h-24 rounded-full bg-gradient-to-br from-neutral-100 to-stone-200 shadow-xl"></div>
                    <div className="absolute -bottom-4 -left-6 w-20 h-20 rounded-full bg-gradient-to-br from-stone-100 to-neutral-300 shadow-xl"></div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 bg-stone-50 px-6 py-4 shadow-lg max-w-[200px]">
                <p className="text-xs tracking-widest uppercase text-stone-500 mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>New Arrivals</p>
                <p className="text-sm italic">Spring 2026 collection</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-stone-200 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { label: 'Handmade', sub: 'One at a time' },
            { label: 'Lightweight', sub: 'Comfortable wear' },
            { label: 'Hypoallergenic', sub: 'Sensitive-skin safe' },
            { label: 'Small Batch', sub: 'Limited editions' },
          ].map((item, i) => (
            <div key={i}>
              <p className="text-sm tracking-[0.2em] uppercase mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>{item.label}</p>
              <p className="text-xs text-stone-500 italic">{item.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shop section */}
      <section id="shop" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-6">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-stone-500 mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>
                The Collection ({filteredProducts.length})
              </p>
              <h2 className="text-5xl lg:text-6xl font-light">
                Shop <span className="italic">pieces</span>
              </h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2 text-xs tracking-[0.15em] uppercase transition ${
                    activeCategory === cat
                      ? 'bg-stone-900 text-stone-50'
                      : 'bg-transparent text-stone-700 border border-stone-300 hover:border-stone-900'
                  }`}
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <p className="text-stone-500">Loading your products from Shopify...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
              {filteredProducts.map(product => (
                <div key={product.id} className="group cursor-pointer">
                  <div className="aspect-square bg-gradient-to-br from-stone-200 to-stone-300 mb-4 relative overflow-hidden">
                    {product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1/2 h-1/2 rounded-full bg-stone-50/40 backdrop-blur-sm shadow-inner"></div>
                      </div>
                    )}
                    <button className="absolute top-3 right-3 bg-stone-50/80 p-2 opacity-0 group-hover:opacity-100 transition">
                      <Heart size={14} />
                    </button>
                    <button 
                      onClick={() => addToCart(product)}
                      className="absolute bottom-0 left-0 right-0 bg-stone-900 text-stone-50 py-3 text-xs tracking-[0.2em] uppercase translate-y-full group-hover:translate-y-0 transition" 
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Add to Cart
                    </button>
                  </div>
                  <p className="text-xs text-stone-500 tracking-widest uppercase mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>{product.category}</p>
                  <h3 className="text-lg italic mb-1">{product.name}</h3>
                  <p className="text-stone-700">${product.price > 0 ? product.price.toFixed(2) : 'TBD'}</p>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredProducts.length === 0 && (
            <div className="text-center py-20">
              <p className="text-stone-500">No products in this category yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section id="about" className="bg-stone-100 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-5 gap-12 items-center">
            <div className="lg:col-span-2 aspect-[4/5] bg-gradient-to-br from-stone-200 to-stone-300 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-stone-50/60"></div>
              </div>
            </div>
            <div className="lg:col-span-3">
              <p className="text-xs tracking-[0.3em] uppercase text-stone-500 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
                Meet the Maker
              </p>
              <h2 className="text-5xl lg:text-6xl font-light mb-8 leading-tight">
                Hi, I'm <span className="italic">Glo</span>.
              </h2>
              <div className="space-y-5 text-stone-700 text-lg leading-relaxed max-w-xl">
                <p>
                  Glo's Creations began at a small kitchen table with a block of clay and an idea — that jewelry should feel as personal as the person wearing it.
                </p>
                <p>
                  Every piece in this shop is hand-sculpted in small batches. No two are exactly alike. I love working with neutral, soft palettes that go with everything and feel quietly special.
                </p>
                <p className="italic text-stone-600">
                  Thank you for supporting handmade.
                </p>
              </div>
              <a href="#" className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase border-b border-stone-900 pb-1 mt-10 hover:opacity-60 transition" style={{ fontFamily: "'Inter', sans-serif" }}>
                Read the Full Story <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-stone-500 mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>
            Loved by customers
          </p>
          <div className="flex justify-center gap-1 mb-8">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={18} fill="currentColor" className="text-stone-700" />
            ))}
          </div>
          <blockquote className="text-3xl lg:text-4xl font-light italic leading-relaxed mb-6">
            "These earrings are the most complimented thing I own. The craftsmanship is unreal — they feel like little pieces of art."
          </blockquote>
          <p className="text-xs tracking-[0.2em] uppercase text-stone-500" style={{ fontFamily: "'Inter', sans-serif" }}>
            Sarah M. · Verified Customer
          </p>
        </div>
      </section>

      {/* Newsletter */}
      <section id="contact" className="bg-stone-900 text-stone-50 py-20 lg:py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-stone-400 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
            Stay in the loop
          </p>
          <h2 className="text-4xl lg:text-5xl font-light mb-6">
            New collections, <span className="italic">first.</span>
          </h2>
          <p className="text-stone-300 mb-10 max-w-md mx-auto">
            Be the first to see new pieces and small-batch drops. No spam, ever.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 bg-transparent border border-stone-600 px-5 py-3 text-sm placeholder-stone-500 focus:outline-none focus:border-stone-300"
              style={{ fontFamily: "'Inter', sans-serif" }}
            />
            <button className="bg-stone-50 text-stone-900 px-8 py-3 text-xs tracking-[0.2em] uppercase hover:bg-stone-200 transition" style={{ fontFamily: "'Inter', sans-serif" }}>
              Subscribe
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-50 border-t border-stone-200 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <h3 className="text-2xl italic mb-4">Glo's Creations</h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Handmade polymer clay jewelry, designed and sculpted with care.
              </p>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase mb-4 text-stone-900" style={{ fontFamily: "'Inter', sans-serif" }}>Shop</p>
              <ul className="space-y-2 text-sm text-stone-600">
                <li><a href="#" className="hover:text-stone-900">All Jewelry</a></li>
                <li><a href="#" className="hover:text-stone-900">New Arrivals</a></li>
                <li><a href="#" className="hover:text-stone-900">Best Sellers</a></li>
                <li><a href="#" className="hover:text-stone-900">Gift Cards</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase mb-4 text-stone-900" style={{ fontFamily: "'Inter', sans-serif" }}>Help</p>
              <ul className="space-y-2 text-sm text-stone-600">
                <li><a href="#" className="hover:text-stone-900">Shipping</a></li>
                <li><a href="#" className="hover:text-stone-900">Returns</a></li>
                <li><a href="#" className="hover:text-stone-900">Care Guide</a></li>
                <li><a href="#" className="hover:text-stone-900">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase mb-4 text-stone-900" style={{ fontFamily: "'Inter', sans-serif" }}>Connect</p>
              <div className="flex gap-3">
                <a href="#" className="border border-stone-300 p-2 hover:border-stone-900 transition"><Instagram size={16} /></a>
                <a href="#" className="border border-stone-300 p-2 hover:border-stone-900 transition"><Mail size={16} /></a>
                <a href="#" className="border border-stone-300 p-2 hover:border-stone-900 transition"><MapPin size={16} /></a>
              </div>
            </div>
          </div>
          <div className="border-t border-stone-200 pt-6 flex flex-col md:flex-row justify-between gap-4 text-xs text-stone-500" style={{ fontFamily: "'Inter', sans-serif" }}>
            <p>© 2026 Glo's Creations. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-stone-900">Privacy</a>
              <a href="#" className="hover:text-stone-900">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
