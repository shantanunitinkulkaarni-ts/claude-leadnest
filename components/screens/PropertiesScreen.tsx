'use client'
import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'

interface Props { agentId: string }

export default function PropertiesScreen({ agentId }: Props) {
  const [properties, setProperties] = useState<any[]>([])
  
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
  
  // Media State
  const [files, setFiles] = useState<File[]>([])
  const [existingMedia, setExistingMedia] = useState<string[]>([]) // For rendering already uploaded media
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
      .then(r => r.json())
      .then(d => {
        if (d.data) setProperties(d.data)
      })
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
    setTitle(''); setLocation(''); setPrice(''); setSizeSqft(''); setDescription(''); setFiles([]); setExistingMedia([])
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
    
    // Extract media
    const mediaUrls = p.features?.filter((f: string) => f.startsWith('media:')) || []
    setExistingMedia(mediaUrls)
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
        if (d.url) urls.push(`media:${d.url}`)
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
      location,
      city,
      price: isNaN(numPrice) ? 0 : numPrice,
      type: type.toLowerCase(),
      category: category.toLowerCase(),
      bhk,
      size_sqft: parseInt(sizeSqft) || 0,
      description,
      features: finalMedia, 
      status: status
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
        .file-drop:hover { border-color: #1A1916 !important; background: #fafaf7 !important; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916' }}>Property Portfolio</div>
          <div style={{ fontSize: 12, color: '#6B6860', marginTop: 4 }}>Manage listings. The AI bot uses these properties to recommend matches to leads.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setShowBulkModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#1A1916', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            Bulk Upload CSV
          </button>
          <button 
            onClick={openNewModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            + Add detailed property
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {properties.map((p) => {
          const isActive = p.status === 'active'
          const isSale = p.type === 'sale'
          const bg = isSale ? '#EEF4FC' : '#FEF9E7'
          
          const media = p.features?.filter((f: string) => f.startsWith('media:')) || []
          const firstImage = media.length > 0 ? media[0].split('media:')[1] : null

          return (
            <div key={p.id} onClick={() => openEditModal(p)} className="prop-card" style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', opacity: isActive ? 1 : 0.65, transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ height: 140, background: firstImage ? `url(${firstImage}) center/cover` : bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', position: 'relative', padding: 10 }}>
                {!firstImage && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 40 }}>{isSale ? '🏢' : '🚪'}</div>}
                <button 
                  onClick={(e) => toggleStatus(e, p)}
                  style={{ position: 'relative', zIndex: 2, fontSize: 10, padding: '4px 10px', borderRadius: 20, fontWeight: 500, background: 'rgba(255,255,255,0.92)', color: isActive ? '#1A6B4A' : '#6B6860', border: `1px solid ${isActive ? 'rgba(46,139,95,0.25)' : 'rgba(26,25,22,0.18)'}`, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {p.status?.toUpperCase() || 'ACTIVE'}
                </button>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1916', marginBottom: 2 }}>{p.title}</div>
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
              <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916' }}>Bulk Upload Properties (CSV)</div>
              {!isBulkUploading && <button type="button" onClick={() => setShowBulkModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9E9B92' }}>✕</button>}
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!isBulkUploading ? (
                <>
                  <div style={{ fontSize: 13, color: '#6B6860', lineHeight: 1.5 }}>
                    Upload a CSV file to instantly import hundreds of properties. Please use the exact column headers provided in our template.
                  </div>
                  
                  <button onClick={downloadTemplate} style={{ padding: '8px 16px', borderRadius: 8, background: '#F4F3EE', color: '#1A1916', border: '1px solid rgba(26,25,22,0.08)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
                    ⬇️ Download CSV Template
                  </button>

                  <div className="file-drop" onClick={() => bulkFileInputRef.current?.click()} style={{ border: '1px dashed rgba(26,25,22,0.2)', borderRadius: 8, padding: '30px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#fff', marginTop: 10 }}>
                    <input type="file" ref={bulkFileInputRef} onChange={handleBulkUpload} style={{ display: 'none' }} accept=".csv" />
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>Click or drag your CSV here</div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 24, marginBottom: 16 }}>🚀</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 8 }}>Importing properties...</div>
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
              <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916' }}>{isEditing ? 'Edit Property' : 'Add Detailed Property'}</div>
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
                  <input required value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Baner" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
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

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Exhaustive Description</label>
                <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Detail the amenities, facing, floor level, furnishing status..." rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6B6860', marginBottom: 6 }}>Attachments (Photos, Floor Plans)</label>
                <div className="file-drop" onClick={() => fileInputRef.current?.click()} style={{ border: '1px dashed rgba(26,25,22,0.2)', borderRadius: 8, padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#fff' }}>
                  <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,video/*,application/pdf" />
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📸</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916' }}>Click or drag files here</div>
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

            <div style={{ padding: '16px 24px', background: '#FAFAF7', borderTop: '1px solid rgba(26,25,22,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {isEditing && (
                  <button type="button" onClick={() => setShowDeletePinModal(true)} style={{ padding: '8px 16px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>
                    Delete Property
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#6B6860', border: '1px solid rgba(26,25,22,0.18)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit' }}>Cancel</button>
                <button type="submit" disabled={isSubmitting || isUploadingMedia} style={{ padding: '8px 16px', borderRadius: 8, background: priceWarning && !hasConfirmedWarning ? '#C62828' : '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', opacity: (isSubmitting || isUploadingMedia) ? 0.7 : 1, transition: 'all 0.2s' }}>
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
            <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1916', marginBottom: 6 }}>Delete Property?</div>
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
