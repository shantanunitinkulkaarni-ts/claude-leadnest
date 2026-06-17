'use client'
import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import { extractPropertyMedia } from '@/lib/media'

interface Props { agentId: string }

// Normalise a typed area/locality so the same place isn't stored five ways
// (" baner ", "Baner  Road") — trims and collapses internal whitespace. The
// bot's matcher is already case- and typo-tolerant, so we don't force casing.
function normalizeArea(s: string): string {
  return (s || '').trim().replace(/\s+/g, ' ')
}

export default function PropertiesScreen({ agentId }: Props) {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Modals
  const [showModal, setShowModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [showDeletePinModal, setShowDeletePinModal] = useState(false)
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletePinInput, setDeletePinInput] = useState('')

  // Exhaustive Form State
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('Pune')
  const [price, setPrice] = useState('')
  const [type, setType] = useState('Sale')
  const [category, setCategory] = useState('Apartment')
  const [bhk, setBhk] = useState('2BHK')
  const [sizeSqft, setSizeSqft] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')
  // New (June 13 batch 2)
  const [possessionStatus, setPossessionStatus] = useState('ready_to_move')
  const [possessionDate, setPossessionDate] = useState('')
  const [deposit, setDeposit] = useState('')
  const [projectWebsite, setProjectWebsite] = useState('')
  const [websiteAiConsent, setWebsiteAiConsent] = useState(false)
  const [extraInfo, setExtraInfo] = useState('')
  
  // Media State
  const [files, setFiles] = useState<File[]>([])
  const [existingMedia, setExistingMedia] = useState<string[]>([]) // bare media URLs already on the property (property_media)
  const [amenityFeatures, setAmenityFeatures] = useState<string[]>([]) // non-media features[] entries, preserved across save
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bulkFileInputRef = useRef<HTMLInputElement>(null)
  
  // Validation
  const [priceWarning, setPriceWarning] = useState<string | null>(null)
  const [hasConfirmedWarning, setHasConfirmedWarning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Bulk State
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkTotal, setBulkTotal] = useState(0)
  const [isBulkUploading, setIsBulkUploading] = useState(false)

  const fetchProperties = () => {
    fetch('/api/properties?agent_id=' + agentId)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) { setFetchError(d.error || `Error ${r.status}`); setLoading(false); return }
        setFetchError(null)
        setProperties(d.data || [])
        setLoading(false)
      })
      .catch(err => { setFetchError(err.message); setLoading(false) })
  }

  useEffect(() => {
    fetchProperties()
  }, [agentId])

  // Price Validation Logic
  useEffect(() => {
    const numPrice = parseInt(price.toString().replace(/,/g, ''))
    setHasConfirmedWarning(false)

    if (!isNaN(numPrice)) {
      if (type.toLowerCase() === 'sale' && numPrice > 0 && numPrice < 1000000) {
        setPriceWarning(`₹${numPrice.toLocaleString()} is dangerously low for a sale. Did you mean ₹${(numPrice * 10).toLocaleString()} or ₹${(numPrice * 100).toLocaleString()}?`)
      } else if (type.toLowerCase() === 'rental' && numPrice > 500000) {
        setPriceWarning(`₹${numPrice.toLocaleString()}/month is very high for a rental. Did you mean ₹${(numPrice / 10).toLocaleString()}?`)
      } else {
        setPriceWarning(null)
      }
    } else {
      setPriceWarning(null)
    }
  }, [price, type])

  const openNewModal = () => {
    setIsEditing(false)
    setEditingId(null)
    setTitle(''); setLocation(''); setPrice(''); setSizeSqft(''); setDescription(''); setFiles([]); setExistingMedia([]); setAmenityFeatures([])
    setPossessionStatus('ready_to_move'); setPossessionDate(''); setDeposit(''); setProjectWebsite(''); setWebsiteAiConsent(false); setExtraInfo('')
    setPriceWarning(null); setHasConfirmedWarning(false)
    setShowModal(true)
  }

  const openEditModal = (p: any) => {
    setIsEditing(true)
    setEditingId(p.id)
    setTitle(p.title || '')
    setLocation(p.location || '')
    setCity(p.city || 'Pune')
    setPrice(p.price?.toString() || '')
    setType(p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : 'Sale')
    setCategory(p.category ? p.category.charAt(0).toUpperCase() + p.category.slice(1) : 'Apartment')
    setBhk(p.bhk || '')
    setSizeSqft(p.size_sqft?.toString() || '')
    setDescription(p.description || '')
    setStatus(p.status || 'active')
    setPossessionStatus(p.possession_status || 'ready_to_move')
    setPossessionDate(p.possession_date || '')
    setDeposit(p.deposit?.toString() || '')
    setProjectWebsite(p.project_website || '')
    setWebsiteAiConsent(!!p.website_ai_consent)
    setExtraInfo(p.extra_info || '')

    // Media now lives in property_media (Phase 0F); extractPropertyMedia falls
    // back to legacy features media: entries for any unmigrated row. Bare URLs.
    setExistingMedia(extractPropertyMedia(p))
    // Preserve real amenity features (non-media) so save doesn't wipe them.
    setAmenityFeatures((p.features || []).filter((f: string) => typeof f === 'string' && !f.startsWith('media:')))
    setFiles([])

    setPriceWarning(null)
    setHasConfirmedWarning(false)
    setShowModal(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const uploadFiles = async () => {
    const urls: string[] = []
    if (files.length === 0) return urls
    
    setIsUploadingMedia(true)
    for (const f of files) {
      const fd = new FormData()
      fd.append('file', f)
      try {
        const r = await fetch('/api/properties/upload', { method: 'POST', body: fd })
        const d = await r.json()
        if (d.url) urls.push(d.url) // bare URL — stored in property_media
      } catch(e) {
        console.error('File upload failed', e)
      }
    }
    setIsUploadingMedia(false)
    return urls
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (priceWarning && !hasConfirmedWarning) {
      setHasConfirmedWarning(true)
      return
    }

    setIsSubmitting(true)
    
    const newMediaUrls = await uploadFiles()
    const finalMedia = [...existingMedia, ...newMediaUrls]
    const numPrice = parseInt(price.toString().replace(/,/g, ''))

    const payload = {
      id: editingId,
      agent_id: agentId,
      title,
      location: normalizeArea(location),
      city,
      price: isNaN(numPrice) ? 0 : numPrice,
      type: type.toLowerCase(),
      category: category.toLowerCase(),
      bhk,
      size_sqft: parseInt(sizeSqft) || 0,
      description,
      property_media: finalMedia,   // canonical media column (Phase 0F) — bare URLs
      features: amenityFeatures,      // amenities only; media no longer lives here
      status: status,
      possession_status: possessionStatus,
      possession_date: possessionStatus === 'ready_to_move' ? null : (possessionDate || null),
      deposit: type.toLowerCase() === 'rental' ? (parseInt(deposit.replace(/[^0-9]/g, '')) || null) : null,
      project_website: projectWebsite.trim() || null,
      website_ai_consent: !!(projectWebsite.trim() && websiteAiConsent),
      extra_info: extraInfo.trim() || null,
    }
    
    try {
      const res = await fetch('/api/properties', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const d = await res.json()
      if (d.error) {
        alert('Failed to save property. DB Error: ' + d.error)
      } else {
        setShowModal(false)
        fetchProperties()
        if (!isEditing) {
          // Notify the onboarding tutorial that a property was added
          window.dispatchEvent(new CustomEvent('leadnest:tour-action', { detail: 'property-added' }))
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (deletePinInput === '1234') {
      try {
        await fetch(`/api/properties?id=${editingId}`, { method: 'DELETE' })
        setShowDeletePinModal(false)
        setShowModal(false)
        setDeletePinInput('')
        fetchProperties()
      } catch (e) {
        alert('Delete failed')
      }
    } else {
      alert('Incorrect PIN')
    }
  }

  const toggleStatus = async (e: React.MouseEvent, prop: any) => {
    e.stopPropagation()
    const newStatus = prop.status === 'active' ? 'sold' : 'active'
    
    setProperties(prev => prev.map(p => p.id === prop.id ? { ...p, status: newStatus } : p))
    
    try {
      await fetch('/api/properties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prop.id, status: newStatus })
      })
    } catch (err) {
      fetchProperties()
    }
  }

  // --- BULK UPLOAD LOGIC ---
  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Project Name,BHK,Category,Type,Price,Location,City,Area Sqft,Description\nLodha Belmondo,3BHK,Apartment,Sale,8500000,Baner,Pune,1450,Luxury property with all amenities";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leadnest_properties_template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[]
        if (rows.length === 0) return
        
        setIsBulkUploading(true)
        setBulkTotal(rows.length)
        setBulkProgress(0)

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const pType = (row['Type'] || 'sale').toLowerCase()
          let pPrice = parseInt((row['Price'] || '').replace(/,/g, ''))
          
          if (pType === 'sale' && pPrice > 0 && pPrice < 1000) pPrice = pPrice * 100000;

          const payload = {
            agent_id: agentId,
            title: row['Project Name'] || 'Unknown Property',
            bhk: row['BHK'] || '',
            category: (row['Category'] || 'apartment').toLowerCase(),
            type: pType,
            price: isNaN(pPrice) ? 0 : pPrice,
            location: row['Location'] || '',
            city: row['City'] || 'Pune',
            size_sqft: parseInt(row['Area Sqft']) || 0,
            description: row['Description'] || '',
            features: [], 
            status: 'active'
          }

          try {
            await fetch('/api/properties', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          } catch(e) {
            console.error(`Failed to upload row ${i}`, e)
          }
          setBulkProgress(prev => prev + 1)
        }
        
        setIsBulkUploading(false)
        setShowBulkModal(false)
        fetchProperties()
        if (bulkFileInputRef.current) bulkFileInputRef.current.value = ''
      }
    })
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', overflowY: 'auto' }}>
      <style>{`
        .prop-card:hover { transform: translateY(-3px); box-shadow: 0 8px 16px rgba(0,0,0,0.06) !important; }
        .file-drop:hover { border-color: #15161B !important; background: #FAFAFB !important; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Property Portfolio</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginTop: 4 }}>Manage listings. The AI bot uses these properties to recommend matches to leads.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setShowBulkModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#15161B', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            Bulk Upload CSV
          </button>
          <button
            data-tour="add-property"
            onClick={openNewModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            + Add detailed property
          </button>
        </div>
      </div>

      {fetchError && (
        <div style={{ background: '#FDF0F0', border: '1px solid rgba(192,57,43,0.2)', color: '#8B1A1A', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {fetchError}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9E9B92', fontSize: 14 }}>Loading properties...</div>
      )}

      {!loading && !fetchError && properties.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: '#C8C5BC' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 8.5V21h14V8.5"/><path d="M9 21v-7h6v7"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>No properties yet</div>
          <div style={{ fontSize: 13, color: '#9E9B92', marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
            Add your first property listing. The AI bot will use these to recommend matches to leads during conversations.
          </div>
          <button onClick={openNewModal} style={{ padding: '10px 20px', borderRadius: 8, background: '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
            + Add your first property
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {properties.map((p) => {
          const isActive = p.status === 'active'

          const media = extractPropertyMedia(p)
          const firstImage = media.length > 0 ? media[0] : null

          return (
            <div key={p.id} onClick={() => openEditModal(p)} className="prop-card" style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', opacity: isActive ? 1 : 0.65, transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ height: 140, background: firstImage ? `url(${firstImage}) center/cover` : 'linear-gradient(160deg, #F4F3EE 0%, #ECEAE4 100%)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', position: 'relative', padding: 10 }}>
                {!firstImage && (
                  // Professional no-photo placeholder: neutral gradient + outline mark + label
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#B7B4AA' }}>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>No photos yet</span>
                  </div>
                )}
                <button 
                  onClick={(e) => toggleStatus(e, p)}
                  style={{ position: 'relative', zIndex: 2, fontSize: 10, padding: '4px 10px', borderRadius: 20, fontWeight: 500, background: 'rgba(255,255,255,0.92)', color: isActive ? '#4338CA' : '#6B6860', border: `1px solid ${isActive ? 'rgba(79,70,229,0.25)' : 'rgba(26,25,22,0.18)'}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {p.status?.toUpperCase() || 'ACTIVE'}
                </button>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#15161B', marginBottom: 2 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#9E9B92' }}>{p.location}, {p.city}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: '#1A5FA5', margin: '10px 0' }}>₹{p.price?.toLocaleString()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.bhk && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#F4F3EE', color: '#6B6860' }}>{p.bhk}</span>}
                  {p.size_sqft > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#F4F3EE', color: '#6B6860' }}>{p.size_sqft} sqft</span>}
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#F4F3EE', color: '#6B6860', textTransform: 'capitalize' }}>{p.category}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 450, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>Bulk Upload Properties (CSV)</div>
              {!isBulkUploading && <button type="button" onClick={() => setShowBulkModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>}
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!isBulkUploading ? (
                <>
                  <div style={{ fontSize: 13, color: '#6B6860', lineHeight: 1.5 }}>
                    Upload a CSV file to instantly import hundreds of properties. Please use the exact column headers provided in our template.
                  </div>
                  
                  <button onClick={downloadTemplate} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#15161B', border: '1px solid rgba(26,25,22,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                    ⬇️ Download CSV Template
                  </button>

                  <div className="file-drop" onClick={() => bulkFileInputRef.current?.click()} style={{ border: '1px dashed rgba(26,25,22,0.2)', borderRadius: 8, padding: '30px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#fff', marginTop: 10 }}>
                    <input type="file" ref={bulkFileInputRef} onChange={handleBulkUpload} style={{ display: 'none' }} accept=".csv" />
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>Click or drag your CSV here</div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 24, marginBottom: 16 }}>🚀</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#15161B', marginBottom: 8 }}>Importing properties...</div>
                  <div style={{ fontSize: 13, color: '#6B6860', marginBottom: 16 }}>{bulkProgress} of {bulkTotal} uploaded</div>
                  <div style={{ height: 6, background: '#F4F3EE', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#1A5FA5', width: `${(bulkProgress / bulkTotal) * 100}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit/Add Property Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleSave} style={{ background: '#fff', borderRadius: 16, width: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B' }}>{isEditing ? 'Edit Property' : 'Add Detailed Property'}</div>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Project / Property Name</label>
                  <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Lodha Belmondo 3BHK" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>BHK Configuration</label>
                  <select value={bhk} onChange={e => setBhk(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    <option>1BHK</option><option>2BHK</option><option>3BHK</option><option>4BHK+</option><option>Plot/Land</option><option>Commercial</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    <option>Apartment</option><option>Villa</option><option>Plot</option><option>Shop</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Type</label>
                  <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    <option>Sale</option><option>Rental</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Price (₹)</label>
                  <input required value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 8500000" type="text" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${priceWarning ? '#E53935' : 'rgba(26,25,22,0.18)'}`, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
              </div>

              {priceWarning && (
                <div style={{ background: '#FFEBEE', color: '#C62828', padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚠️ {priceWarning}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Location Area</label>
                  <input required list="known-area-list" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Baner" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  <datalist id="known-area-list">
                    {Array.from(new Set(properties.map((p: any) => p.location).filter(Boolean))).map((loc: any) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>City</label>
                  <input required value={city} onChange={e => setCity(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Area (sqft)</label>
                  <input value={sizeSqft} onChange={e => setSizeSqft(e.target.value)} placeholder="e.g. 1100" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                </div>
              </div>

              {/* Possession + (rental) deposit */}
              <div style={{ display: 'grid', gridTemplateColumns: possessionStatus === 'ready_to_move' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Possession</label>
                  <select value={possessionStatus} onChange={e => setPossessionStatus(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    <option value="ready_to_move">Ready to move</option>
                    <option value="under_construction">Under construction</option>
                    <option value="new_launch">New launch</option>
                    <option value="resale">Resale</option>
                  </select>
                </div>
                {possessionStatus !== 'ready_to_move' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Possession by</label>
                    <input type="date" value={possessionDate} onChange={e => setPossessionDate(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                )}
                {type.toLowerCase() === 'rental' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Deposit (₹)</label>
                    <input value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="e.g. 100000" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Exhaustive Description</label>
                <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Detail the amenities, facing, floor level, furnishing status..." rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>

              {/* Anything else the bot should know — locality highlights */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Other highlights <span style={{ color: '#9E9B92', fontWeight: 400 }}>(optional — anything special the AI should mention)</span></label>
                <textarea value={extraInfo} onChange={e => setExtraInfo(e.target.value)} placeholder="e.g. 5 min from Jupiter Hospital · heart of the city · top school nearby · gated community" rows={2} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>

              {/* Project website + AI consent */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Project website <span style={{ color: '#9E9B92', fontWeight: 400 }}>(optional)</span></label>
                <input value={projectWebsite} onChange={e => setProjectWebsite(e.target.value)} placeholder="e.g. https://lodhatowers.com" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                {projectWebsite.trim() && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: 'pointer', background: '#F4F8FD', border: '1px solid rgba(26,95,165,0.15)', borderRadius: 8, padding: '10px 12px' }}>
                    <input type="checkbox" checked={websiteAiConsent} onChange={e => setWebsiteAiConsent(e.target.checked)} style={{ marginTop: 2, transform: 'scale(1.1)' }} />
                    <span style={{ fontSize: 11.5, color: '#3D3B34', lineHeight: 1.5 }}>
                      I allow Convorian&apos;s AI to read this website and use its public information (amenities, possession, floor plans, photos) when answering leads about this property. I understand suggestions may be based on details published on that site.
                    </span>
                  </label>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Attachments (Photos, Floor Plans)</label>
                <div className="file-drop" onClick={() => fileInputRef.current?.click()} style={{ border: '1px dashed rgba(26,25,22,0.2)', borderRadius: 8, padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#fff' }}>
                  <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*,application/pdf" />
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: '#9E9B92' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#15161B' }}>Click or drag files here</div>
                  <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 4 }}>JPEG, PNG, MP4, PDF</div>
                </div>
                {(existingMedia.length > 0 || files.length > 0) && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {existingMedia.map((url, i) => (
                      <div key={'ex'+i} style={{ fontSize: 11, background: '#EEF4FC', padding: '4px 10px', borderRadius: 20, color: '#1A5FA5', display: 'flex', alignItems: 'center', gap: 6 }}>
                        📎 Attached File
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExistingMedia(existingMedia.filter((_, idx) => idx !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#1A5FA5', fontSize: 10 }}>✕</button>
                      </div>
                    ))}
                    {files.map((f, i) => (
                      <div key={'new'+i} style={{ fontSize: 11, background: '#F4F3EE', padding: '4px 10px', borderRadius: 20, color: '#6B6860', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {f.name}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, idx) => idx !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#C62828', fontSize: 10 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div style={{ padding: '16px 24px', background: '#FAFAFB', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {isEditing && (
                  <button type="button" onClick={() => setShowDeletePinModal(true)} style={{ padding: '8px 16px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
                    Delete Property
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
                <button type="submit" disabled={isSubmitting || isUploadingMedia} style={{ padding: '8px 16px', borderRadius: 8, background: priceWarning && !hasConfirmedWarning ? '#C62828' : '#15161B', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: (isSubmitting || isUploadingMedia) ? 0.7 : 1, transition: 'all 0.2s' }}>
                  {isUploadingMedia ? 'Uploading media...' : isSubmitting ? 'Saving...' : (priceWarning && !hasConfirmedWarning) ? 'Confirm & Save anyway' : isEditing ? 'Update property' : 'Save property'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete PIN Modal */}
      {showDeletePinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,25,22,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', width: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#15161B', marginBottom: 6 }}>Delete Property?</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginBottom: 20 }}>This action cannot be undone. Enter master PIN (1234) to confirm deletion.</div>
            
            <input 
              type="password" 
              value={deletePinInput} 
              onChange={e => setDeletePinInput(e.target.value)} 
              placeholder="Enter PIN"
              onKeyDown={e => e.key === 'Enter' && handleDelete()}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16, outline: 'none' }}
            />
            
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeletePinModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#6B6860', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: '8px 16px', borderRadius: 8, background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
