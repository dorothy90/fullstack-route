'use client'

import { useState, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import React from 'react'
import './global.css'
import { useRouter } from 'next/navigation'

// 백엔드 API 주소
const API_URL = 'http://localhost:8000';

export default function Home() {
  const [data, setData] = useState([])
  const [headers, setHeaders] = useState([])
  const [selectedRow, setSelectedRow] = useState(null)
  const [filters, setFilters] = useState({
    FAB: '',
    DEVICE: '',
    TECH: '',
    MEMORY_TYPE: '',
    제목: ''
  })
  const [attachments, setAttachments] = useState({})
  const [newComment, setNewComment] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [modalImage, setModalImage] = useState(null)
  const [modalFile, setModalFile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedImages, setSelectedImages] = useState([])
  const [uploadStatus, setUploadStatus] = useState({ isUploading: false, message: '', isSuccess: true })
  const [isRowDataLoading, setIsRowDataLoading] = useState({})
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [attachmentCounts, setAttachmentCounts] = useState({});
  const rowsPerPage = 20; // 페이지당 표시할 행 수
  const [memoryTypeFilter, setMemoryTypeFilter] = useState('DRAM'); // DRAM 필터 기본값 설정

  useEffect(() => {
    // CSV 파일 로드
    fetch('/data/sample.csv')
      .then(response => response.text())
      .then(csv => {
        Papa.parse(csv, {
          header: true,
          complete: (results) => {
            const validData = results.data.filter(row => 
              row && Object.keys(row).length > 0 && 
              Object.values(row).some(value => value !== '')
            )
            
            if (validData.length > 0) {
              const headers = Object.keys(validData[0])
              setHeaders(headers)
              setData(validData)
              
              // 모든 행의 첨부파일 정보를 한 번에 로드 (최적화)
              fetchAllAttachmentCounts();
              setIsInitialLoading(false);
            } else {
              setIsInitialLoading(false);
            }
          }
        })
      })
      .catch(error => {
        console.error('CSV 파일 로드 중 오류 발생:', error)
        setIsInitialLoading(false);
      })
  }, [])

  // 모든 행의 첨부파일 수를 한 번에 불러오는 함수
  const fetchAllAttachmentCounts = async () => {
    try {
      console.log('첨부파일 수 로드 시도...');
      const response = await fetch(`${API_URL}/api/counts/all`);
      
      if (response.ok) {
        const counts = await response.json();
        console.log('모든 행의 첨부파일 수를 불러왔습니다.');
        setAttachmentCounts(counts);
      } else {
        console.error(`첨부파일 수 불러오기 실패: ${response.status}`);
        
        // 실패하면 페이지별 로드 시도
        console.log('페이지별 첨부파일 수 로드로 대체합니다.');
        await loadPageAttachmentCounts();
      }
    } catch (error) {
      console.error('첨부파일 수 불러오기 중 오류:', error);
      
      // 오류 발생 시 현재 페이지만 로드
      console.log('오류 발생, 현재 페이지 첨부파일 수만 로드합니다.');
      await loadPageAttachmentCounts();
    } finally {
      // 로딩 상태 종료
      setIsInitialLoading(false);
    }
  };

  // 특정 행의 첨부파일 정보를 로드하는 함수 (수정)
  const loadRowAttachments = async (row, updateLoadingState = true) => {
    if (!row) return;

    const rowId = `${row.FAB}-${row.DEVICE}-${row.TECH}-${row.제목}`;
    
    // 로딩 상태 설정 (필요한 경우에만)
    if (updateLoadingState) {
      setIsRowDataLoading(prev => ({ ...prev, [rowId]: true }));
    }
    
    try {
      // 서버 연결 실패 시 오류를 더 빨리 감지하기 위한 타임아웃 설정
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
      
      // pageMode=active 파라미터 추가하여 화면에 표시되는 행만 처리하도록 함
      const [commentsRes, filesRes] = await Promise.all([
        fetch(`${API_URL}/api/comments?rowId=${encodeURIComponent(rowId)}&pageMode=active`, {
          signal: controller.signal
        }).catch(e => {
          console.error(`코멘트 로드 실패: ${rowId}`, e);
          return { ok: false, json: async () => [] };
        }),
        fetch(`${API_URL}/api/files?rowId=${encodeURIComponent(rowId)}&pageMode=active`, {
          signal: controller.signal
        }).catch(e => {
          console.error(`파일 로드 실패: ${rowId}`, e);
          return { ok: false, json: async () => ({ files: [], images: [] }) };
        })
      ]);
      
      clearTimeout(timeoutId);
      
      // 서버 응답이 정상이 아닌 경우 빈 배열로 처리
      let commentsData = [];
      let filesData = { files: [], images: [] };
      
      if (commentsRes.ok) {
        try {
          commentsData = await commentsRes.json();
        } catch (e) {
          console.error(`코멘트 데이터 파싱 오류: ${rowId}`, e);
        }
      }
      
      if (filesRes.ok) {
        try {
          filesData = await filesRes.json();
        } catch (e) {
          console.error(`파일 데이터 파싱 오류: ${rowId}`, e);
        }
      }
      
      // attachments 객체 업데이트
      setAttachments(prev => ({
        ...prev,
        [rowId]: {
          comments: ensureArray(commentsData),
          files: ensureArray(filesData.files || []),
          images: ensureArray(filesData.images || [])
        }
      }));
    } catch (error) {
      console.error(`${rowId} 데이터 로드 중 오류:`, error);
      
      // 오류 발생 시 빈 데이터로 설정하여 UI가 계속 동작하도록 함
      setAttachments(prev => ({
        ...prev,
        [rowId]: {
          comments: [],
          files: [],
          images: []
        }
      }));
    } finally {
      // 로딩 상태 해제 (필요한 경우에만)
      if (updateLoadingState) {
        setIsRowDataLoading(prev => ({ ...prev, [rowId]: false }));
      }
    }
  };

  // 행을 선택하면 해당 행의 코멘트와 파일 목록을 다시 불러옴 (최신 데이터 갱신)
  useEffect(() => {
    if (selectedRow) {
      loadCommentsAndFiles();
    }
  }, [selectedRow]);

  // 기존 loadCommentsAndFiles 함수는 유지하되, 로딩 상태만 처리
  const loadCommentsAndFiles = async () => {
    if (!selectedRow) return;

    setIsLoading(true);
    await loadRowAttachments(selectedRow);
    setIsLoading(false);
  };

  // 안전하게 코멘트 목록을 배열로 변환하는 함수
  const ensureArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Object.values(data); // 객체인 경우 값을 배열로 변환
  };

  const handleRowClick = (row) => {
    const isDeselecting = selectedRow === row;
    setSelectedRow(isDeselecting ? null : row);
    
    // 새 행 선택 시 선택된 파일 목록 초기화
    setSelectedFiles([]);
    setSelectedImages([]);
    
    // 행이 선택된 경우 해당 행의 첨부파일 정보 강제 새로고침
    if (!isDeselecting && row) {
      const rowId = `${row.FAB}-${row.DEVICE}-${row.TECH}-${row.제목}`;
      console.log(`행 '${rowId}' 선택됨, 첨부파일 정보 새로고침`);
      
      // 로딩 상태 설정
      setIsRowDataLoading(prev => ({ ...prev, [rowId]: true }));
      
      // 서버에서 최신 데이터 조회
      Promise.all([
        fetch(`${API_URL}/api/comments?rowId=${encodeURIComponent(rowId)}&pageMode=active&forceRefresh=true`)
          .then(res => res.ok ? res.json() : [])
          .catch(() => []),
        fetch(`${API_URL}/api/files?rowId=${encodeURIComponent(rowId)}&pageMode=active&forceRefresh=true`)
          .then(res => res.ok ? res.json() : { files: [], images: [] })
          .catch(() => ({ files: [], images: [] }))
      ])
      .then(([commentsData, filesData]) => {
        // 결과 업데이트
        setAttachments(prev => ({
          ...prev,
          [rowId]: {
            comments: ensureArray(commentsData),
            files: ensureArray(filesData.files || []),
            images: ensureArray(filesData.images || [])
          }
        }));
      })
      .catch(error => {
        console.error(`행 정보 새로고침 중 오류:`, error);
      })
      .finally(() => {
        // 로딩 상태 해제
        setIsRowDataLoading(prev => ({ ...prev, [rowId]: false }));
      });
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files.length || !selectedRow) return;

    setSelectedFiles(Array.from(files).map(file => file.name));
    setUploadStatus({ isUploading: true, message: '파일을 업로드 중입니다...', isSuccess: true });

    const rowId = `${selectedRow.FAB}-${selectedRow.DEVICE}-${selectedRow.TECH}-${selectedRow.제목}`;
    
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('rowId', rowId);
        formData.append('file', file);

        const response = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`파일 ${file.name} 업로드 실패: ${response.status}`);
        }
          
        await response.json();
      }
      
      setUploadStatus({ isUploading: false, message: '파일 업로드가 완료되었습니다!', isSuccess: true });
      setTimeout(() => {
        setUploadStatus({ isUploading: false, message: '', isSuccess: true });
      }, 3000);
      
      await loadCommentsAndFiles();
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      setUploadStatus({ isUploading: false, message: `오류: ${error.message}`, isSuccess: false });
    }
  }

  const handleImageUpload = async (e) => {
    if (!selectedRow) return;
    const files = e.target.files;
    if (files.length) {
      setSelectedImages(Array.from(files).map(file => file.name));
      setUploadStatus({ isUploading: true, message: '이미지를 업로드 중입니다...', isSuccess: true });
    }
    try {
      await handleFileUpload(e);
    } catch (error) {
      setUploadStatus({ isUploading: false, message: `오류: ${error.message}`, isSuccess: false });
    }
  }

  // API 연결 상태 확인
  useEffect(() => {
    // 서버 상태 확인
    const checkServerStatus = async () => {
      try {
        console.log("서버 상태 확인 시도:", `${API_URL}/api/status`);
        const response = await fetch(`${API_URL}/api/status`);
        if (response.ok) {
          const data = await response.json();
          console.log("서버 연결 성공:", data);
        } else {
          console.error("서버 연결 실패:", response.status);
        }
      } catch (error) {
        console.error("서버 연결 중 오류:", error.message);
      }
    };

    checkServerStatus();
  }, []);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedRow) return;

    const form = e.target;
    const formData = new FormData(form);
    
    // 폼 데이터 확인
    console.log("폼 데이터 확인:");
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    }
    
    // API 주소 명시적 로깅
    const apiUrl = `${API_URL}/api/comments`;
    console.log("API 요청 URL:", apiUrl);
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData
      });
      
      console.log("응답 상태:", response.status);
      const responseText = await response.text();
      console.log("응답 텍스트:", responseText);
      
      let responseData = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.log("JSON 파싱 실패, 텍스트 응답:", responseText);
      }
      
      if (response.ok) {
        console.log("코멘트 저장 성공:", responseData);
        setNewComment('');
        await loadCommentsAndFiles();
      } else {
        console.error("API 오류:", response.status, responseData);
      }
    } catch (error) {
      console.error('코멘트 저장 중 오류:', error.message, error.stack);
    }
  }

  const handleImageClick = (image) => {
    // 이미지 URL 확인 및 정규화
    let imageUrl = '';
    let imageName = '';
    
    console.log('Image clicked:', image);
    
    if (image && image.url) {
      imageUrl = image.url.startsWith('http') ? image.url : `${API_URL}${image.url}`;
      imageName = image.filename || '이미지';
      console.log('Using image.url:', imageUrl);
    } else if (image && typeof image === 'string') {
      imageUrl = image;
      imageName = '이미지';
      console.log('Using image as string:', imageUrl);
    } else if (image && image.previewUrl) {
      imageUrl = image.previewUrl;
      imageName = image.filename || image.name || '이미지';
      console.log('Using image.previewUrl:', imageUrl);
    } else if (image && image.src) {
      imageUrl = image.src;
      imageName = image.alt || '이미지';
      console.log('Using image.src:', imageUrl);
    } else {
      console.warn('Could not determine image URL from:', image);
      return; // 유효한 URL이 없으면 모달을 열지 않음
    }
    
    // 최종 URL에 API_URL 접두사 확인
    if (imageUrl && imageUrl.startsWith('/api/') && !imageUrl.startsWith('http')) {
      imageUrl = `${API_URL}${imageUrl}`;
      console.log('Added API_URL prefix:', imageUrl);
    }
    
    console.log('Final image URL for modal:', imageUrl);
    setModalImage({url: imageUrl, name: imageName});
  }

  const handleCloseModal = () => {
    setModalImage(null);
  }

  const handleFileClick = (file) => {
    // PDF 등 미리보기 가능한 파일 타입 확인
    const previewableTypes = ['application/pdf', 'image/'];
    const isPreviewable = previewableTypes.some(type => 
      file.contentType?.includes(type) || (typeof file.type === 'string' && file.type.includes(type))
    );
    
    if (isPreviewable) {
      // 파일 URL 구성
      const fileUrl = file.url ? `${API_URL}${file.url}` : file.data;
      setModalFile({
        ...file,
        previewUrl: fileUrl
      });
    } else {
      // 다운로드 링크 열기
      window.open(file.url ? `${API_URL}${file.url}` : file.data, '_blank');
    }
  }

  const handleCloseFileModal = () => {
    setModalFile(null);
  }

  const getFileIcon = (fileType) => {
    if (!fileType) return '📎';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('excel') || fileType.includes('spreadsheet') || fileType.includes('csv')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📑';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('zip') || fileType.includes('compressed')) return '🗜️';
    if (fileType.includes('audio')) return '🔊';
    if (fileType.includes('video')) return '🎬';
    return '📎';
  }

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(typeof timestamp === 'string' ? timestamp : Number(timestamp));
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 현재 페이지에 표시되는 행만 계산하는 함수 (메모리 타입 필터 추가)
  const getCurrentPageRows = () => {
    // 필터링된 데이터 (메모리 타입 필터 추가)
    const filteredData = data.filter(row => {
      // 메모리 타입 필터 적용
      if (memoryTypeFilter && row.MEMORY_TYPE !== memoryTypeFilter) {
        return false;
      }
      
      // 기존 필터 적용
      return Object.keys(filters).every(key => {
        if (!filters[key]) return true; // 필터가 비어있으면 모든 행 표시
        return row[key] && row[key].toLowerCase().includes(filters[key].toLowerCase());
      });
    });
    
    // 페이지네이션 처리
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredData.slice(startIndex, endIndex);
  };

  // 페이지 변경 처리 함수
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    
    // 페이지 변경 시 해당 페이지의 첨부파일 정보만 로드
    loadPageAttachmentCounts(newPage);
  };

  // 현재 페이지에 표시되는 행의 첨부파일 수만 로드하는 함수
  const loadPageAttachmentCounts = async (page = currentPage) => {
    try {
      console.log(`페이지 ${page}의 첨부파일 수 로드 시도...`);
      const response = await fetch(`${API_URL}/api/counts/page?page=${page}&per_page=${rowsPerPage}`);
      
      if (response.ok) {
        const counts = await response.json();
        // 기존 카운트 정보를 유지하면서 새 정보만 업데이트
        setAttachmentCounts(prev => ({...prev, ...counts}));
        console.log(`페이지 ${page}의 첨부파일 수를 로드했습니다.`);
        return true;
      } else {
        console.error(`페이지 첨부파일 수 로드 실패: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('페이지 첨부파일 수 로드 중 오류:', error);
      return false;
    }
  };

  // 페이지 변경시 자동으로 첨부파일 정보 로드
  useEffect(() => {
    if (!isInitialLoading && data.length > 0) {
      loadPageAttachmentCounts();
    }
  }, [currentPage]);

  // 전체 페이지 수 계산 (메모리 타입 필터 추가)
  const totalPages = Math.ceil(
    data.filter(row => {
      // 메모리 타입 필터 적용
      if (memoryTypeFilter && row.MEMORY_TYPE !== memoryTypeFilter) {
        return false;
      }
      
      // 기존 필터 적용
      return Object.keys(filters).every(key => {
        if (!filters[key]) return true;
        return row[key] && row[key].toLowerCase().includes(filters[key].toLowerCase());
      });
    }).length / rowsPerPage
  );

  // 첨부파일 항목 수 가져오기 함수 (최적화)
  const getAttachmentCounts = (row) => {
    if (!row) return { comments: 0, files: 0, images: 0 };
    
    const rowId = `${row.FAB}-${row.DEVICE}-${row.TECH}-${row.제목}`;
    
    // 실제 attachment 데이터가 있으면 그것을 우선적으로 사용
    if (attachments[rowId]) {
      return {
        comments: ensureArray(attachments[rowId].comments).length || 0,
        files: ensureArray(attachments[rowId].files).length || 0,
        images: ensureArray(attachments[rowId].images).length || 0
      };
    }
    
    // 캐시된 카운트 정보가 있으면 사용
    if (attachmentCounts[rowId]) {
      return attachmentCounts[rowId];
    }
    
    // 캐시된 정보가 없으면 기본값 반환
    return { comments: 0, files: 0, images: 0 };
  };

  // 필터링된 데이터 계산 (메모리 타입 필터 추가)
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // 메모리 타입 필터 적용
      if (memoryTypeFilter && row.MEMORY_TYPE !== memoryTypeFilter) {
        return false;
      }
      
      // 기존 필터 적용
      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        return row[key]?.toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [data, filters, memoryTypeFilter]);

  const filterOptions = useMemo(() => {
    const options = {};
    headers.forEach(header => {
      options[header] = [...new Set(filteredData.map(row => row[header]).filter(Boolean))];
    });
    return options;
  }, [filteredData, headers]);

  // 필터링된 데이터가 변경될 때 누락된 첨부파일 정보만 로드
  useEffect(() => {
    if (filteredData && filteredData.length > 0 && !isInitialLoading) {
      try {
        // 아직 로드되지 않은 행만 찾아서 로드
        const rowsToLoad = filteredData.filter(row => {
          const rowId = `${row.FAB}-${row.DEVICE}-${row.TECH}-${row.제목}`;
          return !attachments[rowId];
        });
        
        if (rowsToLoad.length > 0) {
          // 오류 처리 개선: 개별 행의 오류가 전체 로딩을 중단하지 않도록 함
          rowsToLoad.forEach(row => {
            loadRowAttachments(row, false)
              .catch(error => console.error('첨부파일 정보 로드 중 오류:', error));
          });
        }
      } catch (error) {
        console.error('첨부파일 정보 로드 중 일반 오류:', error);
      }
    }
  }, [filteredData, isInitialLoading]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // 스크롤 이벤트 리스너 추가
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleDashboardClick = (e) => {
    e.preventDefault();
    router.push('/dashboard');
  };

  return (
    <main>
      {/* 네비게이션 바 */}
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
        <div className="navbar-container">
          <div className="navbar-logo">
            <span className="logo-text">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon">
                <path d="M3 6H21M3 12H21M3 18H21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 3L8 21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 3L20 12L16 21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              ROUTE TASKMASTER
            </span>
          </div>
          <div className={`navbar-menu ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <a href="/" className="navbar-link active">DRAM ROUTE</a>
            <a href="/dashboard" className="navbar-link" onClick={handleDashboardClick}>NAND ROUTE</a>

          </div>
          <div className="navbar-user">
            <span className="user-icon">👤</span>
            <span className="user-name">사용자</span>
          </div>
          <button className="mobile-menu-button" onClick={toggleMobileMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6H21M3 12H21M3 18H21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* 이미지 모달 */}
      {modalImage && (
        <div 
          style={{
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.8)'
          }}
          className="image-modal-overlay"
          onClick={handleCloseModal}
        >
          <div 
            style={{
              position: 'relative',
              width: '800px',
              height: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="image-modal-content"
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              padding: '12px 48px 12px 20px',
              borderBottom: '1px solid #eee',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#333',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            className="modal-title"
            >
              {typeof modalImage === 'object' ? modalImage.name : '이미지 보기'}
            </div>
            <button
              onClick={handleCloseModal}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                color: '#666',
                zIndex: 10,
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <svg style={{width: '32px', height: '32px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div style={{
              width: '100%', 
              height: '100%',
              marginTop: '40px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={typeof modalImage === 'object' ? modalImage.url : modalImage}
                alt="확대된 이미지"
                style={{
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 파일 모달 */}
      {modalFile && (
        <div 
          style={{
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.8)'
          }}
          className="image-modal-overlay"
          onClick={handleCloseFileModal}
        >
          <div 
            style={{
              position: 'relative',
              width: '800px',
              height: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="image-modal-content"
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              padding: '12px 48px 12px 20px',
              borderBottom: '1px solid #eee',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#333',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            className="modal-title"
            >
              {modalFile.filename || modalFile.name || '파일 보기'}
            </div>
            <button
              onClick={handleCloseFileModal}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                color: '#666',
                zIndex: 10,
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <svg style={{width: '32px', height: '32px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div style={{
              width: '100%', 
              height: '100%',
              marginTop: '40px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {modalFile.contentType?.includes('pdf') || modalFile.type?.includes('pdf') ? (
                <iframe
                  src={modalFile.previewUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                  title={modalFile.filename || modalFile.name}
                />
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '20px'
                }}>
                  <p style={{
                    fontSize: '16px',
                    marginBottom: '20px',
                    color: '#555'
                  }}>
                    {modalFile.filename || modalFile.name} 파일은 브라우저에서 직접 볼 수 없습니다.
                  </p>
                  <a
                    href={modalFile.previewUrl}
                    download={modalFile.filename || modalFile.name}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    파일 다운로드
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-container">
        <h1 className="dashboard-title">DRAM ROUTE MASTER</h1>
        
        {/* 필터 섹션 */}
        <div className="filter-section">
          {Object.keys(filters).map(key => (
            <div key={key}>
              <input
                type="text"
                list={`${key}-list`}
                value={filters[key]}
                onChange={(e) => handleFilterChange(key, e.target.value)}
                placeholder={`${key} 검색`}
              />
              <datalist id={`${key}-list`}>
                <option value="">전체</option>
                {filterOptions[key]?.map(option => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header}>{header}</th>
                ))}
                <th>첨부파일</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                <tr>
                  <td colSpan={headers.length} className="loading-cell">
                    데이터를 불러오는 중...
                  </td>
                </tr>
              ) : (
                getCurrentPageRows().map((row, index) => {
                  const isSelected = selectedRow === row;
                  const counts = getAttachmentCounts(row);
                  const rowId = `${row.FAB}-${row.DEVICE}-${row.TECH}-${row.제목}`;
                  return (
                    <React.Fragment key={rowId}>
                      <tr
                        onClick={() => handleRowClick(row)}
                        className={isSelected ? 'selected-row' : ''}
                      >
                        {headers.map(header => (
                          <td key={header}>{row[header] || '-'}</td>
                        ))}
                        <td>
                          {isInitialLoading || isRowDataLoading[rowId] ? (
                            <div className="loading-spinner-small"></div>
                          ) : (
                            <div className="attachment-counts">
                              <span className="attachment-count images" role="img" aria-label="이미지">
                                <span role="img" aria-label="이미지">📷</span> {counts.images}
                              </span>
                              <span className="attachment-count comments" role="img" aria-label="코멘트">
                                <span role="img" aria-label="코멘트">💬</span> {counts.comments}
                              </span>
                              <span className="attachment-count files" role="img" aria-label="파일">
                                <span role="img" aria-label="파일">📄</span> {counts.files}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isSelected && (
                        <tr className="detail-row">
                          <td colSpan={headers.length + 1}>
                            <div className="detail-panel">
                              {/* 상세 정보 */}
                              <div className="detail-info">
                                <h2 style={{fontWeight:'bold',marginBottom:16}}>상세 정보</h2>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                                  {headers.map(header => (
                                    <div key={header}>
                                      <div style={{fontSize:'0.95rem',color:'#666',marginBottom:2}}>{header}</div>
                                      <div style={{fontSize:'1.05rem',color:'#222'}}>{row[header] || '-'}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* 오른쪽 섹션 */}
                              <div className="detail-side">
                                {/* 코멘트 */}
                                <div>
                                  <h2 style={{fontWeight:'bold',marginBottom:12}}>코멘트</h2>
                                  <form 
                                    onSubmit={handleCommentSubmit} 
                                    style={{marginBottom:12,display:'flex',gap:8}}
                                  >
                                    <input
                                      type="text"
                                      name="text"
                                      value={newComment}
                                      onChange={(e) => setNewComment(e.target.value)}
                                      placeholder="코멘트를 입력하세요"
                                      style={{flex:1,padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:'1rem'}}
                                    />
                                    <input type="hidden" name="rowId" value={rowId} />
                                    <input type="hidden" name="author" value="사용자" />
                                    <button 
                                      type="submit" 
                                      style={{padding:'8px 16px',background:'#2563eb',color:'#fff',border:'none',borderRadius:6,fontWeight:'bold',cursor:'pointer'}}
                                    >
                                      추가
                                    </button>
                                  </form>
                                  <div className="comment-list">
                                    {isLoading ? (
                                      <div>로딩중...</div>
                                    ) : (
                                      ensureArray(attachments[rowId]?.comments).map((comment, i) => (
                                        <div key={i} className="comment-item">
                                          <div>{comment.text}</div>
                                          {(comment.author || comment.timestamp) && (
                                            <div style={{fontSize:'0.85rem',color:'#888',marginTop:4}}>
                                              {comment.author && `${comment.author} • `}
                                              {formatDate(comment.timestamp || comment.createdAt)}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                                
                                {/* 첨부파일 */}
                                <div>
                                  <h2 style={{fontWeight:'bold',marginBottom:12}}>첨부파일</h2>
                                  <div className="file-input-container">
                                    <label htmlFor="file-upload">
                                      파일 선택
                                    </label>
                                    <span className="file-type-description">PDF, Excel, PowerPoint, Word 등의 파일을 선택하세요</span>
                                    <input
                                      id="file-upload"
                                      type="file"
                                      accept="image/*,.pdf,.xlsx,.xls,.pptx,.ppt,.docx,.doc"
                                      onChange={handleFileUpload}
                                      multiple
                                      disabled={uploadStatus.isUploading}
                                    />
                                    {uploadStatus.message && (
                                      <div className={`upload-status ${uploadStatus.isSuccess ? 'success' : 'error'}`}>
                                        {uploadStatus.isUploading ? (
                                          <div className="upload-spinner"></div>
                                        ) : null}
                                        {uploadStatus.message}
                                      </div>
                                    )}
                                    {selectedFiles.length > 0 && (
                                      <div className="selected-files">
                                        <p>선택된 파일:</p>
                                        <ul>
                                          {selectedFiles.map((fileName, index) => (
                                            <li key={index}>{fileName}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                  <div className="file-list">
                                    {isLoading ? (
                                      <div>로딩중...</div>
                                    ) : (
                                      ensureArray(attachments[rowId]?.files).map((file, i) => (
                                        <div 
                                          key={i} 
                                          className="file-item" 
                                          onClick={() => handleFileClick(file)}
                                        >
                                          <span style={{fontSize:'1.2rem'}}>{getFileIcon(file.contentType || file.type)}</span>
                                          <span>{file.filename || file.name}</span>
                                          <span style={{fontSize:'0.9rem',color:'#888'}}>{formatFileSize(file.size)} • {formatDate(file.timestamp || file.lastModified)}</span>
                                          <a 
                                            href={file.url ? `${API_URL}${file.url}` : file.data} 
                                            download={file.filename || file.name} 
                                            onClick={e => e.stopPropagation()} 
                                            style={{marginLeft:'auto',color:'#2563eb',fontWeight:'bold',textDecoration:'underline'}}
                                          >
                                            다운로드
                                          </a>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                                
                                {/* 이미지 */}
                                <div>
                                  <h2 style={{fontWeight:'bold',marginBottom:12}}>이미지</h2>
                                  <div className="file-input-container">
                                    <label htmlFor="image-upload">
                                      이미지 선택
                                    </label>
                                    <span className="file-type-description">PNG, JPG, GIF 등의 이미지 파일을 선택하세요</span>
                                    <input
                                      id="image-upload"
                                      type="file"
                                      accept="image/*"
                                      onChange={handleImageUpload}
                                      multiple
                                      disabled={uploadStatus.isUploading}
                                    />
                                    {!selectedFiles.length > 0 && uploadStatus.message && (
                                      <div className={`upload-status ${uploadStatus.isSuccess ? 'success' : 'error'}`}>
                                        {uploadStatus.isUploading ? (
                                          <div className="upload-spinner"></div>
                                        ) : null}
                                        {uploadStatus.message}
                                      </div>
                                    )}
                                    {selectedImages.length > 0 && (
                                      <div className="selected-files">
                                        <p>선택된 이미지:</p>
                                        <ul>
                                          {selectedImages.map((fileName, index) => (
                                            <li key={index}>{fileName}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                  <div className="image-list">
                                    {isLoading ? (
                                      <div>로딩중...</div>
                                    ) : ensureArray(attachments[rowId]?.images).length === 0 ? (
                                      <div className="no-images">업로드된 이미지가 없습니다</div>
                                    ) : (
                                      ensureArray(attachments[rowId]?.images).map((image, i) => {
                                        // 이미지 URL 처리
                                        const imageUrl = image.url 
                                          ? `${API_URL}${image.url}`
                                          : (typeof image === 'string' ? image : null);
                                        
                                        if (!imageUrl) return null;
                                        
                                        return (
                                          <div key={i} className="image-thumb-container">
                                            <img
                                              src={imageUrl}
                                              alt={`첨부 이미지 ${i + 1}`}
                                              className="image-thumb"
                                              onClick={() => handleImageClick(image)}
                                              onError={(e) => {
                                                console.error(`이미지 로딩 실패: ${imageUrl}`);
                                                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Crect x="3" y="3" width="18" height="18" rx="2" ry="2"%3E%3C/rect%3E%3Ccircle cx="9" cy="9" r="2"%3E%3C/circle%3E%3Cpath d="M21 15l-5-5L5 21"%3E%3C/path%3E%3C/svg%3E';
                                              }}
                                            />
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 UI 추가 */}
        {!isInitialLoading && totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => handlePageChange(currentPage - 1)} 
              disabled={currentPage === 1}
              className="pagination-button"
            >
              이전
            </button>
            <span className="page-info">{currentPage} / {totalPages}</span>
            <button 
              onClick={() => handlePageChange(currentPage + 1)} 
              disabled={currentPage === totalPages}
              className="pagination-button"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
